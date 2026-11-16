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
 * (pattern — the App ID is assigned at Zapier registration), or a loopback
 * http://localhost:* / http://127.0.0.1:* URI (local testing,
 * incl. Claude Code's ephemeral loopback port). Anything else is
 * refused — an open-redirect via a registered client is not
 * possible. A redirect URI must ALSO be exactly registered/
 * documented for the client using it (validateRedirectUri) AND
 * valid for that client's platform (validateRedirectUriForPlatform):
 * a Muse client must NOT be able to use a Claude callback URI and
 * vice versa, even if the URI were registered for it. The allowlist
 * alone is never enough.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";

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

export type OAuthClientPlatform = "muse" | "chatgpt" | "claude" | "zapier";

/**
 * Which platform a client belongs to, from its registered /
 * documented redirect URIs: a client carrying a Claude callback
 * is a Claude client, else a client carrying the ChatGPT callback
 * is a ChatGPT client, otherwise a Muse client. Used only for
 * defaults (default scope, default `resource`) and for binding
 * redirect validation to the platform; it never grants anything —
 * authorization always goes through the grant's scopes and tiers.
 * A client registering callbacks for two platforms resolves to
 * one platform (Claude wins over ChatGPT wins over Muse) and can
 * then only use that platform's callback (see
 * validateRedirectUriForPlatform).
 */
export function clientPlatform(client: Pick<MuseOAuthClientRow, "redirect_uris">): OAuthClientPlatform {
  if (client.redirect_uris.some((uri) => isZapierRedirectUri(uri))) {
    return "zapier";
  }
  if (client.redirect_uris.some((uri) => (CLAUDE_OAUTH_CALLBACKS as readonly string[]).includes(uri))) {
    return "claude";
  }
  return client.redirect_uris.includes(CHATGPT_OAUTH_CALLBACK) ? "chatgpt" : "muse";
}

/** Human label for a client platform, shown on the consent screen. */
export function platformLabel(platform: OAuthClientPlatform): string {
  if (platform === "chatgpt") return "ChatGPT";
  if (platform === "claude") return "Claude";
  if (platform === "zapier") return "Zapier";
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
 * Muse, ChatGPT or Claude callbacks, or a loopback
 * http://localhost:<port>[/path] / http://127.0.0.1:<port>[/path]
 * URI.
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
  const redirectUris: string[] = [];
  for (const uri of input.redirectUris) {
    if (typeof uri !== "string" || !isAllowedOAuthRedirectUri(uri)) {
      return {
        ok: false,
        detail:
          "Every redirect_uri must be the Muse callback (https://agent.meta.ai/api/hatch/oauth/callback), the ChatGPT callback (https://chatgpt.com/connector_platform_oauth_redirect), a Claude callback (https://claude.ai/api/mcp/auth_callback or https://claude.com/api/mcp/auth_callback), a Zapier callback (https://zapier.com/dashboard/auth/oauth/return/App<digits>CLIAPI/), or a loopback http://localhost:* / http://127.0.0.1:* URI.",
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
