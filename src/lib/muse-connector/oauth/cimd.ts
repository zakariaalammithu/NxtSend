/**
 * CIMD — Client ID Metadata Documents (OpenID Connect Core §7 / the
 * ChatGPT connector platform's client identification).
 *
 * A ChatGPT client identifies itself with a `client_id` that IS an
 * https URL (e.g. https://chatgpt.com/...). The authorization
 * server fetches that URL, which serves the client's metadata
 * document (redirect_uris, client_name, grant_types,
 * response_types, token_endpoint_auth_method, jwks_uri), and
 * validates it. The client is EPHEMERAL: it is validated per
 * request and cached in memory only (~5 min) — it is NEVER written
 * to `muse_oauth_clients` as if it had registered via DCR. DCR
 * stays as the fallback for clients that do not serve a CIMD.
 *
 * Fail closed throughout: a non-https client_id, a fetch error, a
 * timeout, an oversized response, bad JSON, or a document that
 * fails validation all refuse the client — never a partial trust.
 *
 * `private_key_jwt` is NOT supported (see the verdict in
 * resolveCimdClient): a document declaring it is still accepted,
 * but the client is treated as a public client
 * (`token_endpoint_auth_method: "none"`) and any `client_assertion`
 * presented at the token endpoint is refused with
 * `invalid_client`. The reason: verifying JWT bearer assertions
 * needs a JWKS fetch + RS256/ES256 signature verification + aud /
 * exp / jti replay checks — a whole new trust surface — while the
 * connector platform's flow is a public client with PKCE S256,
 * which this server already enforces. A document declaring
 * `client_secret_basic` / `client_secret_post` IS refused: those
 * methods need a secret this server never issued for a CIMD client.
 */

import {
  CHATGPT_OAUTH_CALLBACK,
  CLAUDE_OAUTH_CALLBACKS,
  isAllowedOAuthRedirectUri,
  type OAuthClientPlatform,
} from "./clients";
import type { MuseOAuthClientRow } from "./store";

/** Fetch timeout for a CIMD document (~5s). */
export const CIMD_FETCH_TIMEOUT_MS = 5_000;
/** Maximum CIMD response body (~64KB). */
export const CIMD_MAX_BYTES = 64 * 1024;
/** In-memory cache TTL for a fetched document (~5 min). */
export const CIMD_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CimdDocument {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  jwks_uri?: string;
  client_uri?: string;
}

/** True when a client_id is a CIMD URL (an https URL). */
export function isCimdClientId(value: string | null | undefined): boolean {
  if (!value || !value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

type ValidateCimdResult =
  | { ok: true; document: CimdDocument }
  | { ok: false; detail: string };

/**
 * Validates a parsed CIMD document. `redirect_uris` must be a
 * non-empty array of allowlisted URIs (a platform callback or
 * loopback — so a ChatGPT document must list the ChatGPT callback
 * and a Claude document must list a Claude callback);
 * `grant_types`, when present, must include `authorization_code`;
 * `response_types`, when present, must include `code`. A declared
 * `client_secret_*` auth method is refused (no secret exists for a
 * CIMD client); `private_key_jwt` is recorded as unsupported but
 * does not fail the document — the client is treated as public and
 * assertions are refused at the token endpoint.
 */
export function validateCimdDocument(doc: unknown): ValidateCimdResult {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, detail: "Client metadata document must be a JSON object." };
  }
  const d = doc as Record<string, unknown>;
  if (!Array.isArray(d.redirect_uris) || d.redirect_uris.length === 0) {
    return { ok: false, detail: "Client metadata document must list non-empty redirect_uris." };
  }
  if (d.redirect_uris.length > 10) {
    return { ok: false, detail: "Client metadata document lists too many redirect_uris (max 10)." };
  }
  for (const uri of d.redirect_uris) {
    if (typeof uri !== "string" || !isAllowedOAuthRedirectUri(uri)) {
      return {
        ok: false,
        detail:
          "Every redirect_uri in the client metadata document must be the Muse callback, the ChatGPT callback, a Claude callback (https://claude.ai/api/mcp/auth_callback or https://claude.com/api/mcp/auth_callback), or a loopback http://localhost:* / http://127.0.0.1:* URI.",
      };
    }
  }
  if (d.grant_types !== undefined) {
    if (!Array.isArray(d.grant_types) || !d.grant_types.includes("authorization_code")) {
      return { ok: false, detail: "Client metadata document grant_types must include authorization_code." };
    }
  }
  if (d.response_types !== undefined) {
    if (!Array.isArray(d.response_types) || !d.response_types.includes("code")) {
      return { ok: false, detail: "Client metadata document response_types must include code." };
    }
  }
  const authMethod = d.token_endpoint_auth_method;
  if (authMethod !== undefined && typeof authMethod === "string") {
    if (authMethod === "client_secret_basic" || authMethod === "client_secret_post") {
      return {
        ok: false,
        detail: `token_endpoint_auth_method "${authMethod}" is not usable for a CIMD client: no client secret is registered for it.`,
      };
    }
    if (authMethod !== "none" && authMethod !== "private_key_jwt") {
      return { ok: false, detail: `Unsupported token_endpoint_auth_method "${authMethod}".` };
    }
  }
  if (d.client_name !== undefined && (typeof d.client_name !== "string" || d.client_name.trim().length === 0 || d.client_name.length > 200)) {
    return { ok: false, detail: "client_name in the client metadata document must be a non-empty string (max 200 characters)." };
  }
  const document: CimdDocument = {
    redirect_uris: d.redirect_uris as string[],
  };
  if (typeof d.client_name === "string") document.client_name = d.client_name.trim();
  if (Array.isArray(d.grant_types)) document.grant_types = d.grant_types as string[];
  if (Array.isArray(d.response_types)) document.response_types = d.response_types as string[];
  if (typeof d.token_endpoint_auth_method === "string") {
    document.token_endpoint_auth_method = d.token_endpoint_auth_method;
  }
  if (typeof d.jwks_uri === "string") document.jwks_uri = d.jwks_uri;
  if (typeof d.client_uri === "string") document.client_uri = d.client_uri;
  return { ok: true, document };
}

// ── Fetch + cache ───────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const cimdCache = new Map<string, { document: CimdDocument; fetchedAt: number }>();

/** Clears the in-memory CIMD cache (tests; also useful on deploy). */
export function clearCimdCache(): void {
  cimdCache.clear();
}

export interface FetchCimdOptions {
  fetchFn?: FetchFn;
  nowMs?: number;
}

/**
 * Fetches and validates a CIMD document: https only, ~5s timeout,
 * ~64KB size cap, JSON body, validated shape. Successful documents
 * are cached in memory for ~5 min keyed by URL. Failures are never
 * cached. Returns null for ANY problem — fail closed.
 */
export async function fetchCimdDocument(
  clientIdUrl: string,
  opts: FetchCimdOptions = {}
): Promise<CimdDocument | null> {
  if (!isCimdClientId(clientIdUrl)) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const cached = cimdCache.get(clientIdUrl);
  if (cached && nowMs - cached.fetchedAt < CIMD_CACHE_TTL_MS) return cached.document;

  const fetchFn: FetchFn =
    opts.fetchFn ??
    ((url: string, init?: RequestInit) => fetch(url, init));
  let res: Response;
  try {
    res = await fetchFn(clientIdUrl, {
      signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  // Size cap: read the body as a stream and stop past 64KB.
  let text: string;
  try {
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > CIMD_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      text = new TextDecoder("utf-8").decode(merged);
    } else {
      text = await res.text();
      if (text.length > CIMD_MAX_BYTES) return null;
    }
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const validated = validateCimdDocument(parsed);
  if (!validated.ok) return null;
  cimdCache.set(clientIdUrl, { document: validated.document, fetchedAt: nowMs });
  return validated.document;
}

// ── Ephemeral client ────────────────────────────────────────────────────────

export type ResolveCimdResult =
  | {
      ok: true;
      /** Ephemeral client row — validated per request, NEVER stored. */
      client: MuseOAuthClientRow;
      document: CimdDocument;
      platform: OAuthClientPlatform;
      /**
       * True when the document declared `private_key_jwt`: the
       * client is treated as public and assertions are refused at
       * the token endpoint (private_key_jwt is not implemented).
       */
      privateKeyJwtDeclared: boolean;
    }
  | { ok: false; detail: string };

/**
 * Resolves a CIMD `client_id` URL to an ephemeral client row. The
 * row's `id` is prefixed `cimd:` so it can never be confused with a
 * stored client; callers must never pass it to store methods that
 * persist clients. The client name comes from the document's
 * `client_name`, falling back to the URL origin.
 */
export async function resolveCimdClient(
  clientIdUrl: string,
  opts: FetchCimdOptions & { now?: Date } = {}
): Promise<ResolveCimdResult> {
  const document = await fetchCimdDocument(clientIdUrl, opts);
  if (!document) {
    return {
      ok: false,
      detail: "Could not fetch or validate the client metadata document for this client_id.",
    };
  }
  const origin = new URL(clientIdUrl).origin;
  // Platform from the documented redirect URIs: a Claude callback
  // (either host) means Claude, else the ChatGPT callback means
  // ChatGPT, else Muse. The client_id URL's own host is checked
  // too: Claude Code's published CIMD
  // (https://claude.ai/oauth/claude-code-client-metadata) declares
  // only loopback redirects (no Claude callback), so without the
  // host check it would resolve as Muse. A document hosted on
  // claude.ai / claude.com (or a subdomain) is Claude's published
  // identity.
  const host = new URL(clientIdUrl).hostname.toLowerCase();
  const isClaudeHost =
    host === "claude.ai" ||
    host.endsWith(".claude.ai") ||
    host === "claude.com" ||
    host.endsWith(".claude.com");
  const platform: OAuthClientPlatform =
    isClaudeHost ||
    document.redirect_uris.some((uri) =>
      (CLAUDE_OAUTH_CALLBACKS as readonly string[]).includes(uri)
    )
      ? "claude"
      : document.redirect_uris.includes(CHATGPT_OAUTH_CALLBACK)
        ? "chatgpt"
        : "muse";
  const now = opts.now ?? new Date();
  return {
    ok: true,
    client: {
      id: `cimd:${clientIdUrl}`,
      client_id: clientIdUrl,
      client_secret_hash: null,
      name: document.client_name ?? origin,
      redirect_uris: document.redirect_uris,
      created_at: now.toISOString(),
    },
    document,
    platform,
    privateKeyJwtDeclared: document.token_endpoint_auth_method === "private_key_jwt",
  };
}
