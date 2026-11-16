/**
 * Authorize-request validation + code issuance (pure core).
 *
 * GET /api/muse/oauth/authorize validates the request here; on
 * success the route renders the consent screen with a signed state
 * (./state.ts) carrying the request. POST verifies that state and
 * issues the code. Invalid requests redirect with OAuth error params
 * when a valid redirect_uri exists, else the route shows a plain
 * error page — never leak internals.
 *
 * RFC 8707 `resource`: the request may name the MCP resource it is
 * for. The value must equal one of the canonical MCP resource URLs
 * for this origin byte-for-byte, else `invalid_target`. When no
 * resource is sent, it defaults to the canonical resource for the
 * client's platform (Muse → /api/mcp, ChatGPT → /api/mcp/chatgpt,
 * Claude → /api/mcp/claude)
 * and is recorded on the code, so the token is audience-bound
 * either way. RFC 9207 `iss` (the authorization server issuer) is
 * added to success and error redirects by the route.
 */

import { randomBytes } from "crypto";
import { isS256Method } from "./pkce";
import {
  clientPlatform,
  type OAuthClientPlatform,
} from "./clients";
import { DEFAULT_OAUTH_ORIGIN, getMcpResourceUrl } from "./config";
import { defaultScopeForPlatform, normalizeScopes, type OAuthScope } from "./scopes";
import { hashToken, MUSE_CODE_TTL_MS } from "./tokens";
import { validateRedirectUriForPlatform } from "./clients";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";

export type AuthorizeErrorCode =
  | "invalid_request"
  | "unauthorized_client"
  | "unsupported_response_type"
  | "invalid_scope"
  | "invalid_client"
  | "invalid_target";

export interface ValidAuthorizeRequest {
  client: MuseOAuthClientRow;
  redirectUri: string;
  scopes: OAuthScope[];
  codeChallenge: string;
  clientState: string | null;
  /** RFC 8707 resource the grant is bound to (full MCP resource URL). */
  resource: string;
  /** Which platform the client is (drives consent-screen wording). */
  platform: OAuthClientPlatform;
  /** Origin of the client's client_id URL (CIMD clients), else null. */
  clientOrigin: string | null;
}

export type ValidateAuthorizeResult =
  | { ok: true; request: ValidAuthorizeRequest }
  | {
      ok: false;
      error: AuthorizeErrorCode;
      errorDescription: string;
      /** Present only when a usable redirect_uri was supplied. */
      redirectUri: string | null;
      clientState: string | null;
    };

export interface AuthorizeParams {
  client_id?: string | null;
  redirect_uri?: string | null;
  response_type?: string | null;
  scope?: string | null;
  state?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  /** RFC 8707 resource indicator (the MCP resource URL). */
  resource?: string | null;
}

export interface ValidateAuthorizeOptions {
  /** Public origin of this deployment; defaults to the canonical origin. */
  origin?: string;
}

/**
 * Validates an authorize request against a client looked up by the
 * caller (the store lookup stays in the route so this stays pure).
 * `client` is null when the client_id is unknown/unregistered.
 */
export function validateAuthorizeRequest(
  params: AuthorizeParams,
  client: MuseOAuthClientRow | null,
  opts: ValidateAuthorizeOptions = {}
): ValidateAuthorizeResult {
  const clientState =
    typeof params.state === "string" && params.state.length > 0 ? params.state : null;
  const redirectUri =
    typeof params.redirect_uri === "string" ? params.redirect_uri : null;
  const origin = opts.origin ?? DEFAULT_OAUTH_ORIGIN;
  const platform: OAuthClientPlatform = client ? clientPlatform(client) : "muse";
  let clientOrigin: string | null = null;
  if (client && client.client_id.startsWith("https://")) {
    try {
      clientOrigin = new URL(client.client_id).origin;
    } catch {
      clientOrigin = null;
    }
  }

  if (!params.client_id) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "client_id is required.",
      redirectUri: null,
      clientState,
    };
  }
  if (!client) {
    return {
      ok: false,
      error: "invalid_client",
      errorDescription: "Unknown client_id.",
      redirectUri: null,
      clientState,
    };
  }
  // From here a redirect_uri may be usable for error redirects — but
  // only when it is exactly registered for this client AND valid for
  // this client's platform: a Muse client must not be able to use a
  // Claude callback URI (and vice versa), even if it were registered.
  const usableRedirect =
    redirectUri && validateRedirectUriForPlatform(client, redirectUri, platform)
      ? redirectUri
      : null;
  if (!redirectUri) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "redirect_uri is required.",
      redirectUri: null,
      clientState,
    };
  }
  if (!usableRedirect) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription:
        "redirect_uri does not match the client's registered redirect URIs for this platform.",
      redirectUri: null,
      clientState,
    };
  }
  if (params.response_type !== "code") {
    return {
      ok: false,
      error: "unsupported_response_type",
      errorDescription: "Only response_type=code is supported.",
      redirectUri: usableRedirect,
      clientState,
    };
  }
  // Scopes: when the client asks for none, default to the
  // least-privilege scope for its platform (muse.read / nxtsend.read /
  // claude.read).
  const scopes =
    params.scope && params.scope.trim()
      ? normalizeScopes(params.scope)
      : [defaultScopeForPlatform(platform)];
  if (!scopes) {
    return {
      ok: false,
      error: "invalid_scope",
      errorDescription: "Requested scope includes an unknown scope.",
      redirectUri: usableRedirect,
      clientState,
    };
  }
  if (!params.code_challenge) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "code_challenge is required (PKCE S256).",
      redirectUri: usableRedirect,
      clientState,
    };
  }
  if (!isS256Method(params.code_challenge_method ?? null)) {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "Only code_challenge_method=S256 is supported.",
      redirectUri: usableRedirect,
      clientState,
    };
  }
  // RFC 8707 resource: when sent it must equal the canonical MCP
  // resource URL for THIS client's platform, byte-for-byte, for
  // this origin; when absent it defaults to that same resource. A
  // ChatGPT client asking for the Muse resource (or vice versa)
  // is refused — a token must never be issued for the other
  // platform's resource.
  const allowedResource = getMcpResourceUrl(origin, platform);
  let resource: string;
  if (params.resource && params.resource.trim()) {
    resource = params.resource.trim();
    if (resource !== allowedResource) {
      return {
        ok: false,
        error: "invalid_target",
        errorDescription: "resource must be the MCP resource URL for this deployment.",
        redirectUri: usableRedirect,
        clientState,
      };
    }
  } else {
    resource = allowedResource;
  }
  return {
    ok: true,
    request: {
      client,
      redirectUri: usableRedirect,
      scopes,
      codeChallenge: params.code_challenge,
      clientState,
      resource,
      platform,
      clientOrigin,
    },
  };
}

/** Builds an OAuth error redirect URL (error + description + state, plus RFC 9207 `iss` when given). */
export function buildOAuthErrorRedirect(
  redirectUri: string,
  error: string,
  errorDescription: string,
  clientState: string | null,
  iss?: string | null
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", errorDescription);
  if (clientState) url.searchParams.set("state", clientState);
  if (iss) url.searchParams.set("iss", iss);
  return url.toString();
}

/** Builds a successful authorize redirect URL (code + state, plus RFC 9207 `iss` when given). */
export function buildOAuthSuccessRedirect(
  redirectUri: string,
  code: string,
  clientState: string | null,
  iss?: string | null
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (clientState) url.searchParams.set("state", clientState);
  if (iss) url.searchParams.set("iss", iss);
  return url.toString();
}

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  workspaceId: string;
  scopes: OAuthScope[];
  codeChallenge: string;
  redirectUri: string;
  /** RFC 8707 resource the code is bound to; null stores a legacy (unbound) code. */
  resource?: string | null;
}

/**
 * Issues a 10-minute single-use authorization code, stored as a
 * hash. Returns the plaintext code exactly once — the redirect
 * carries it to the client, and it is never shown again.
 */
export async function issueAuthorizationCode(
  store: MuseOAuthStore,
  input: IssueCodeInput,
  now: Date = new Date()
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await store.insertCode({
    code_hash: hashToken(code),
    client_id: input.clientId,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    scopes: input.scopes,
    code_challenge: input.codeChallenge,
    redirect_uri: input.redirectUri,
    resource: input.resource ?? null,
    expires_at: new Date(now.getTime() + MUSE_CODE_TTL_MS).toISOString(),
  });
  return code;
}
