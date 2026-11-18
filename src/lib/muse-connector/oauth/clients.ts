/**
 * Muse OAuth clients — lookup, redirect validation, DCR creation.
 *
 * There is NO env-configured static client anywhere in NxtSend (no
 * other integration has one either): clients exist only by Dynamic
 * Client Registration (RFC 7591) into `muse_oauth_clients`, or —
 * for ChatGPT and Claude — as ephemeral CIMD clients (see ./cimd.ts),
 * which are validated per request and never stored. There is NO
 * CLAUDE_OAUTH_CLIENT_SECRET anywhere: Claude connects as a public
 * client (DCR or CIMD, `token_endpoint_auth_method: "none"`, PKCE
 * S256); a customer-entered client ID is used without a secret.
 *
 * Redirect allowlist: the Muse callback
 * https://agent.meta.ai/api/hatch/oauth/callback, the ChatGPT
 * callback https://chatgpt.com/connector_platform_oauth_redirect,
 * the Claude callbacks https://claude.ai/api/mcp/auth_callback and
 * https://claude.com/api/mcp/auth_callback, any Zapier callback
 * matching https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/
 * (pattern — the App ID is assigned at Zapier registration), any
 * https n8n callback (n8n instances are self-hosted or Cloud, so
 * the callback host is instance-specific — see isN8nRedirectUri),
 * or a loopback http://localhost:* / http://127.0.0.1:* URI (local
 * testing, incl. Claude Code's ephemeral loopback port). Anything
 * else is refused — an open-redirect via a registered client is not
 * possible. A redirect URI must ALSO be exactly registered/
 * documented for the client using it (validateRedirectUri) AND
 * valid for that client's platform (validateRedirectUriForPlatform):
 * a Muse client must NOT be able to use a Claude callback URI and
 * vice versa, even if the URI were registered for it. The allowlist
 * alone is never enough.
 *
 * n8n redirect note: "any https" is deliberately the n8n rule —
 * there is no fixed n8n callback host to allowlist (Cloud:
 * https://<name>.app.n8n.cloud/rest/oauth2-credential/callback,
 * self-hosted: any https host). This is NOT an open redirect: the
 * authorize step still requires an EXACT match against the
 * redirect_uris the client registered via DCR, the consent screen
 * shows the redirect hostname to the user before approval, and a
 * client of another platform cannot use an n8n URI (platform
 * binding). Localhost / private-IP callbacks are refused in
 * production; http://localhost loopback is allowed only when the
 * deployment is local (NODE_ENV !== "production"), mirroring the
 * loopback rule for the other platforms.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";
import { resourcePlatform } from "./config";

/** The Muse callback every registered Muse client must use. */
export const MUSE_OAUTH_CALLBACK = "https://agent.meta.ai/api/hatch/oauth/callback";

/** The ChatGPT connector-platform callback. */
export const CHATGPT_OAUTH_CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";

/**
 * The Claude callbacks. Anthropic's hosted surfaces (claude.ai web,
 * Desktop, mobile, Cowork) use `https://claude.ai/api/mcp/auth_callback`
 * (verified against claude.com/docs/connectors/building/authentication,
 * 2026-11-16); `https://claude.com/api/mcp/auth_callback` is allowlisted
 * alongside it because Claude's web app is served from both hosts —
 * it was NOT confirmed in the official doc fetched that day, so if
 * Claude ever stops sending it, remove it here.
 */
export const CLAUDE_OAUTH_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
export const CLAUDE_COM_OAUTH_CALLBACK = "https://claude.com/api/mcp/auth_callback";
/** Both Claude callback URIs. */
export const CLAUDE_OAUTH_CALLBACKS = [CLAUDE_OAUTH_CALLBACK, CLAUDE_COM_OAUTH_CALLBACK] as const;

/**
 * Zapier OAuth redirect URIs are NOT a fixed URL: Zapier shows one
 * per app in the developer dashboard, of the form
 * `https://zapier.com/dashboard/auth/oauth/return/AppXXXXXCLIAPI/`
 * where `AppXXXXX` is the App ID assigned at registration. The App
 * ID — and therefore the URL — may change after publish/beta, so
 * the allowlist is a PATTERN, not a constant: host must be exactly
 * `zapier.com`, path must be
 * `/dashboard/auth/oauth/return/App<digits>CLIAPI/` (trailing slash
 * tolerated). Verified against Zapier community snippets and the
 * platform docs' REST-hook URL shape (hook targets live on
 * `hooks.zapier.com`; the OAuth return URL is on `zapier.com`).
 * The exact URL is copied from the Zapier app after registration
 * and registered for the client via DCR — see
 * docs/zapier-integration/ZAPIER_SERVER.md.
 */
export const ZAPIER_REDIRECT_PATH_PATTERN =
  /^\/dashboard\/auth\/oauth\/return\/App\d+CLIAPI\/?$/;

/** True when a URI is a Zapier OAuth redirect URI (see above). */
export function isZapierRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "zapier.com") return false;
  if (parsed.search || parsed.hash) return false;
  return ZAPIER_REDIRECT_PATH_PATTERN.test(parsed.pathname);
}

export type OAuthClientPlatform =
  | "muse"
  | "chatgpt"
  | "claude"
  | "zapier"
  | "n8n"
  | "make"
  | "pabbly"
  | "albato"
  | "activepieces";

/** Hosts that belong to a known platform's callback (never n8n). */
const KNOWN_CALLBACK_HOSTS = new Set([
  "agent.meta.ai",
  "chatgpt.com",
  "claude.ai",
  "claude.com",
  "zapier.com",
]);

/**
 * True when a hostname is localhost or a private / link-local /
 * loopback IP (IPv4 10/8, 172.16/12, 192.168/16, 127/8,
 * 169.254/16, 0.0.0.0; IPv6 ::1). n8n callbacks on such hosts are
 * refused in production — an n8n instance the user connects must
 * be reachable on a public host.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  return false;
}

/**
 * True when the deployment is local (loopback callbacks allowed).
 * Mirrors the existing loopback rule: local means NODE_ENV is not
 * "production" (tests run as NODE_ENV=test, so loopback works
 * there too).
 */
export function isLocalDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}

/**
 * True when a URI is an n8n OAuth2-credential callback: any https
 * URI on a public host (Cloud
 * `https://<name>.app.n8n.cloud/rest/oauth2-credential/callback`
 * or any self-hosted https host), except the known platforms'
 * callback hosts. Loopback http is allowed only on a local
 * deployment. The URI must still be exactly registered for the
 * client via DCR — this function is an allowlist shape check, not
 * an authorization (see the module header).
 */
export function isN8nRedirectUri(uri: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.search || parsed.hash) return false;
  if (parsed.protocol === "http:") {
    // Loopback only, and only on a local deployment.
    if (!isLocalDeployment(env)) return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  }
  if (parsed.protocol !== "https:") return false;
  if (KNOWN_CALLBACK_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (isPrivateOrLoopbackHost(parsed.hostname)) return false;
  return parsed.hostname.length > 0;
}

/**
 * True when a redirect URI is an automation-platform OAuth
 * callback (Make, Pabbly Connect, Albato, Activepieces): same
 * instance-style rule as n8n — any https URI on a public host,
 * except the known platforms' callback hosts. These platforms
 * have instance/account-specific callback hosts that cannot be
 * allowlisted by value (like n8n), so they share the n8n shape
 * check. Exact DCR registration is still required on top of
 * this (validateRedirectUriForPlatform), and the client must
 * declare the platform's scopes (or resource) to resolve to it.
 */
export function isAutomationRedirectUri(uri: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return isN8nRedirectUri(uri, env);
}

export interface ClientPlatformHints {
  /** Requested scope strings (raw, e.g. ["n8n.read"]). */
  scopes?: string[];
  /** Presented RFC 8707 resource URL, if any. */
  resource?: string | null;
}

/**
 * Which platform a client belongs to. Detection order (documented
 * decision — n8n instances are self-hosted/Cloud with arbitrary
 * callback hosts, so redirect-host detection, the Zapier approach,
 * CANNOT work for n8n):
 *   (a) known redirect hosts — a Zapier return URL → zapier, a
 *       Claude callback → claude, the ChatGPT callback → chatgpt;
 *   (b) requested scope prefix — `n8n.*` → n8n, `zapier.*` →
 *       zapier, `claude.*` → claude, `nxtsend.*` → chatgpt,
 *       `muse.*` → muse;
 *   (c) presented `resource` URL path — `/api/integrations/n8n`
 *       → n8n (and the other resource paths likewise);
 *   (d) an arbitrary https redirect URI on a public host (no
 *       known platform owns it) → n8n: only n8n has
 *       instance-specific callbacks, so an unknown callback host
 *       is an n8n instance;
 *   (e) default `"muse"`.
 * Used only for defaults (default scope, default `resource`) and
 * for binding redirect validation to the platform; it never grants
 * anything — authorization always goes through the grant's scopes
 * and tiers. A client registering callbacks for two platforms
 * resolves to one platform (the first matching rule wins) and can
 * then only use that platform's callback (see
 * validateRedirectUriForPlatform).
 */
export function clientPlatform(
  client: Pick<MuseOAuthClientRow, "redirect_uris">,
  hints: ClientPlatformHints = {}
): OAuthClientPlatform {
  if (client.redirect_uris.some((uri) => isZapierRedirectUri(uri))) {
    return "zapier";
  }
  if (client.redirect_uris.some((uri) => (CLAUDE_OAUTH_CALLBACKS as readonly string[]).includes(uri))) {
    return "claude";
  }
  if (client.redirect_uris.includes(CHATGPT_OAUTH_CALLBACK)) {
    return "chatgpt";
  }
  const scopeList = hints.scopes ?? [];
  if (scopeList.some((s) => s.startsWith("n8n."))) return "n8n";
  if (scopeList.some((s) => s.startsWith("zapier."))) return "zapier";
  if (scopeList.some((s) => s.startsWith("claude."))) return "claude";
  if (scopeList.some((s) => s.startsWith("nxtsend."))) return "chatgpt";
  if (scopeList.some((s) => s.startsWith("muse."))) return "muse";
  if (scopeList.some((s) => s.startsWith("make."))) return "make";
  if (scopeList.some((s) => s.startsWith("pabbly."))) return "pabbly";
  if (scopeList.some((s) => s.startsWith("albato."))) return "albato";
  if (scopeList.some((s) => s.startsWith("activepieces."))) return "activepieces";
  if (hints.resource) {
    try {
      const pathname = new URL(hints.resource).pathname.replace(/\/+$/, "");
      if (pathname === "/api/integrations/n8n") return "n8n";
      if (pathname === "/api/integrations/zapier") return "zapier";
      if (pathname === "/api/integrations/make") return "make";
      if (pathname === "/api/integrations/pabbly") return "pabbly";
      if (pathname === "/api/integrations/albato") return "albato";
      if (pathname === "/api/integrations/activepieces") return "activepieces";
      if (pathname === "/api/mcp/claude") return "claude";
      if (pathname === "/api/mcp/chatgpt") return "chatgpt";
      if (pathname === "/api/mcp") return "muse";
    } catch {
      // Unparseable resource — fall through.
    }
  }
  // (d) an arbitrary *https* redirect URI on a public host (no
  // known platform owns it) → n8n. Loopback http URIs are NOT an
  // n8n signal — they are local-test callbacks for any platform
  // (Muse, Claude Code) — so only https URIs count here.
  if (
    client.redirect_uris.some((uri) => {
      try {
        return new URL(uri).protocol === "https:" && isN8nRedirectUri(uri);
      } catch {
        return false;
      }
    })
  ) {
    return "n8n";
  }
  return "muse";
}

/** Human label for a client platform, shown on the consent screen. */
export function platformLabel(platform: OAuthClientPlatform): string {
  if (platform === "chatgpt") return "ChatGPT";
  if (platform === "claude") return "Claude";
  if (platform === "zapier") return "Zapier";
  if (platform === "n8n") return "n8n";
  if (platform === "make") return "Make";
  if (platform === "pabbly") return "Pabbly Connect";
  if (platform === "albato") return "Albato";
  if (platform === "activepieces") return "Activepieces";
  return "Muse";
}

/** Cap on registered clients; oldest never-used client is evicted past it. */
export const MUSE_MAX_CLIENTS = 50;

/** A never-used client older than this may be evicted when over cap. */
export const MUSE_CLIENT_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

/** True when a URI is a loopback http://localhost:* / 127.0.0.1:* URI. */
export function isLoopbackRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
}

/**
 * True when a redirect URI is on the allowlist: exactly one of the
 * Muse, ChatGPT or Claude callbacks, a Zapier return URL, or a
 * loopback http://localhost:<port>[/path] / http://127.0.0.1:<port>
 * [/path] URI. This is deliberately a CLOSED list — an arbitrary
 * https URI is NOT allowlisted here, so a client that presents one
 * without declaring itself an n8n client (see
 * validateRegistrationMetadata) is refused. n8n callbacks are
 * instance-specific and cannot be allowlisted by value, so they
 * are validated by the platform-aware check instead
 * (isAllowedRedirectUriForPlatform with platform "n8n"). The
 * allowlist alone never authorizes a redirect — the authorize
 * step also requires exact registration AND a platform match
 * (validateRedirectUriForPlatform).
 */
export function isAllowedOAuthRedirectUri(uri: string): boolean {
  return (
    uri === MUSE_OAUTH_CALLBACK ||
    uri === CHATGPT_OAUTH_CALLBACK ||
    (CLAUDE_OAUTH_CALLBACKS as readonly string[]).includes(uri) ||
    isZapierRedirectUri(uri) ||
    isLoopbackRedirectUri(uri)
  );
}

/**
 * True when a redirect URI is on the Muse allowlist: exactly the
 * Muse callback, or a loopback http://localhost:<port>[/path] URI.
 */
export function isAllowedMuseRedirectUri(uri: string): boolean {
  if (uri === MUSE_OAUTH_CALLBACK) return true;
  return isLoopbackRedirectUri(uri);
}

/**
 * True when a redirect URI is on the Claude allowlist: exactly one
 * of the Claude callbacks, or a loopback http://localhost:<port>
 * [/path] URI (Claude Code's ephemeral loopback port).
 */
export function isAllowedClaudeRedirectUri(uri: string): boolean {
  if ((CLAUDE_OAUTH_CALLBACKS as readonly string[]).includes(uri)) return true;
  return isLoopbackRedirectUri(uri);
}

/**
 * True when a redirect URI is valid for a given platform: exactly
 * that platform's callback(s), or a loopback URI (allowed for every
 * platform — local testing, incl. Claude Code). This is the
 * platform binding: a Muse client presenting a Claude callback
 * (or a Claude client presenting the Muse callback) is refused
 * here even when the URI is allowlisted globally.
 */
export function isAllowedRedirectUriForPlatform(
  uri: string,
  platform: OAuthClientPlatform
): boolean {
  if (platform === "n8n") {
    // Any https n8n callback (instance-specific host) except
    // localhost / private IPs in production; loopback http only
    // on a local deployment. Exact DCR registration is still
    // required on top of this (validateRedirectUriForPlatform) —
    // this is not an open redirect. isN8nRedirectUri already
    // encodes the loopback rule, so no extra loopback arm here.
    return isN8nRedirectUri(uri);
  }
  if (
    platform === "make" ||
    platform === "pabbly" ||
    platform === "albato" ||
    platform === "activepieces"
  ) {
    // Same instance-style rule as n8n: these platforms have
    // instance/account-specific callback hosts that cannot be
    // allowlisted by value. Exact DCR registration is still
    // required on top of this.
    return isAutomationRedirectUri(uri);
  }
  if (platform === "zapier") {
    return isZapierRedirectUri(uri) || isLoopbackRedirectUri(uri);
  }
  if (platform === "claude") return isAllowedClaudeRedirectUri(uri);
  if (platform === "chatgpt") {
    return uri === CHATGPT_OAUTH_CALLBACK || isLoopbackRedirectUri(uri);
  }
  return isAllowedMuseRedirectUri(uri);
}

/** Exact-match check of a redirect URI against a client's allowlist. */
export function isRegisteredRedirectUri(
  client: MuseOAuthClientRow,
  redirectUri: string
): boolean {
  return client.redirect_uris.includes(redirectUri);
}

/**
 * Validates a redirect URI for use: it must be allowlisted (a
 * platform callback, or loopback) AND exactly registered for this
 * client. This does NOT bind the URI to the client's platform —
 * callers at the authorize boundary must also check
 * isAllowedRedirectUriForPlatform (validateAuthorizeRequest does).
 */
export function validateRedirectUri(
  client: MuseOAuthClientRow,
  redirectUri: string | null | undefined
): boolean {
  if (!redirectUri) return false;
  if (!isAllowedOAuthRedirectUri(redirectUri)) return false;
  return isRegisteredRedirectUri(client, redirectUri);
}

/**
 * Validates a redirect URI for use by a client of a known platform:
 * allowlisted AND exactly registered for this client AND valid for
 * that platform (a Muse client may not use a Claude callback URI,
 * a Claude client may not use the Muse or ChatGPT callback, and so
 * on; loopback is valid for every platform).
 */
export function validateRedirectUriForPlatform(
  client: MuseOAuthClientRow,
  redirectUri: string | null | undefined,
  platform: OAuthClientPlatform
): boolean {
  if (!redirectUri) return false;
  if (!isAllowedRedirectUriForPlatform(redirectUri, platform)) return false;
  return isRegisteredRedirectUri(client, redirectUri);
}

/**
 * Constant-time client-secret check (hash-then-compare, like the
 * CRON_SECRET pattern in src/app/api/jobs/run/route.ts). Public
 * clients have no secret: presenting one for a public client is
 * refused, and a confidential client without a matching secret is
 * refused. Returns false for ANY problem — never throws.
 */
export function verifyClientSecret(
  client: MuseOAuthClientRow,
  providedSecret: string | null | undefined
): boolean {
  if (!client.client_secret_hash) {
    // Public client: no secret may be presented.
    return !providedSecret;
  }
  if (!providedSecret) return false;
  const a = Buffer.from(createHash("sha256").update(providedSecret, "utf8").digest("hex"));
  const b = Buffer.from(client.client_secret_hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface RegisterMuseClientInput {
  name: unknown;
  redirectUris: unknown;
  /** Default public (no secret). Set true only when explicitly requested. */
  confidential?: boolean;
  /**
   * Optional scope hint (space-separated string or string array, as
   * in the RFC 7591 `scope` field). When it declares a platform
   * (e.g. `n8n.read`), redirect URIs are validated against THAT
   * platform's rule — this is how an n8n client registers an
   * instance-specific https callback, which the closed global
   * allowlist (isAllowedOAuthRedirectUri) deliberately refuses.
   * Without a platform hint the closed allowlist applies.
   */
  scopes?: unknown;
  /** Optional RFC 8707 resource hint, same role as `scopes`. */
  resource?: unknown;
}

export type RegisterMuseClientResult =
  | {
      ok: true;
      client: MuseOAuthClientRow;
      /** Plaintext secret — returned exactly once, only for confidential clients. */
      clientSecret: string | null;
    }
  | { ok: false; error: "invalid_client_metadata" | "too_many_clients"; detail: string };

function generateClientId(): string {
  return `muse_${randomBytes(16).toString("hex")}`;
}

/**
 * Platform hint for registration, from the declared scopes /
 * resource ONLY — never from the redirect URIs. (clientPlatform's
 * rule (d) — "arbitrary https host → n8n" — must not apply here:
 * a client that merely presents an arbitrary https URI without
 * declaring n8n scopes is refused by the closed allowlist, which
 * is what keeps `https://evil.example/x` unregistrable.)
 */
function registrationPlatform(input: RegisterMuseClientInput): OAuthClientPlatform | null {
  const scopes: string[] = Array.isArray(input.scopes)
    ? input.scopes.filter((s): s is string => typeof s === "string")
    : typeof input.scopes === "string"
      ? input.scopes.split(/\s+/).filter(Boolean)
      : [];
  if (scopes.some((s) => s.startsWith("n8n."))) return "n8n";
  if (scopes.some((s) => s.startsWith("zapier."))) return "zapier";
  if (scopes.some((s) => s.startsWith("claude."))) return "claude";
  if (scopes.some((s) => s.startsWith("nxtsend."))) return "chatgpt";
  if (scopes.some((s) => s.startsWith("muse."))) return "muse";
  if (scopes.some((s) => s.startsWith("make."))) return "make";
  if (scopes.some((s) => s.startsWith("pabbly."))) return "pabbly";
  if (scopes.some((s) => s.startsWith("albato."))) return "albato";
  if (scopes.some((s) => s.startsWith("activepieces."))) return "activepieces";
  if (typeof input.resource === "string") return resourcePlatform(input.resource);
  return null;
}

function validateRegistrationMetadata(input: RegisterMuseClientInput): {
  ok: true;
  name: string;
  redirectUris: string[];
} | { ok: false; detail: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 200) {
    return { ok: false, detail: "client_name is required (max 200 characters)." };
  }
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) {
    return { ok: false, detail: "redirect_uris must be a non-empty array." };
  }
  if (input.redirectUris.length > 10) {
    return { ok: false, detail: "redirect_uris must contain at most 10 URIs." };
  }
  const platform = registrationPlatform(input);
  const redirectUris: string[] = [];
  for (const uri of input.redirectUris) {
    const allowed =
      typeof uri === "string" &&
      (platform
        ? isAllowedRedirectUriForPlatform(uri, platform)
        : isAllowedOAuthRedirectUri(uri));
    if (!allowed) {
      return {
        ok: false,
        detail:
          "Every redirect_uri must be the Muse callback (https://agent.meta.ai/api/hatch/oauth/callback), the ChatGPT callback (https://chatgpt.com/connector_platform_oauth_redirect), a Claude callback (https://claude.ai/api/mcp/auth_callback or https://claude.com/api/mcp/auth_callback), a Zapier callback (https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/), an n8n callback (any https URL on a public host, e.g. https://<instance>/rest/oauth2-credential/callback — register with n8n.* scopes to use one), or a loopback http://localhost:* / http://127.0.0.1:* URI.",
      };
    }
    if (!redirectUris.includes(uri)) redirectUris.push(uri);
  }
  return { ok: true, name, redirectUris };
}

/**
 * Registers a client (RFC 7591). Default public — no secret is
 * issued. When the cap is hit, the oldest never-used client older
 * than 24h is evicted first; when no client qualifies for eviction
 * the registration is refused instead of silently dropping one.
 */
export async function registerMuseClient(
  store: MuseOAuthStore,
  input: RegisterMuseClientInput,
  now: Date = new Date()
): Promise<RegisterMuseClientResult> {
  const meta = validateRegistrationMetadata(input);
  if (!meta.ok) return { ok: false, error: "invalid_client_metadata", detail: meta.detail };

  const clients = await store.listClients();
  if (clients.length >= MUSE_MAX_CLIENTS) {
    // Only evict a client that was never used — check oldest first.
    let evicted = false;
    for (const candidate of clients) {
      const age = now.getTime() - new Date(candidate.created_at).getTime();
      if (age <= MUSE_CLIENT_EVICTION_AGE_MS) continue;
      if (await store.clientHasActivity(candidate.client_id)) continue;
      await store.deleteClient(candidate.client_id);
      evicted = true;
      break;
    }
    if (!evicted) {
      return {
        ok: false,
        error: "too_many_clients",
        detail: `Client limit reached (${MUSE_MAX_CLIENTS}). No never-used client older than 24 hours exists to evict.`,
      };
    }
  }

  const confidential = input.confidential === true;
  const clientSecret = confidential ? randomBytes(32).toString("base64url") : null;
  const client = await store.createClient({
    client_id: generateClientId(),
    client_secret_hash: clientSecret
      ? createHash("sha256").update(clientSecret, "utf8").digest("hex")
      : null,
    name: meta.name,
    redirect_uris: meta.redirectUris,
  });
  return { ok: true, client, clientSecret };
}
