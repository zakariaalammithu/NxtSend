/**
 * Authorize-request validation + code issuance (pure core).
 *
 * GET /api/muse/oauth/authorize validates the request here; on
 * success the route renders the consent screen with a signed state
 * (./state.ts) carrying the request. POST verifies that state and
 * issues the code. Invalid requests redirect with OAuth error params
 * when a valid redirect_uri exists, else the route shows a plain
 * error page — never leak internals.
 */

import { randomBytes } from "crypto";
import { isS256Method } from "./pkce";
import { parseMuseScopes, type MuseScope } from "./scopes";
import { hashToken, MUSE_CODE_TTL_MS } from "./tokens";
import { validateRedirectUri } from "./clients";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";

export type AuthorizeErrorCode =
  | "invalid_request"
  | "unauthorized_client"
  | "unsupported_response_type"
  | "invalid_scope"
  | "invalid_client";

export interface ValidAuthorizeRequest {
  client: MuseOAuthClientRow;
  redirectUri: string;
  scopes: MuseScope[];
  codeChallenge: string;
  clientState: string | null;
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
}

/**
 * Validates an authorize request against a client looked up by the
 * caller (the store lookup stays in the route so this stays pure).
 * `client` is null when the client_id is unknown/unregistered.
 */
export function validateAuthorizeRequest(
  params: AuthorizeParams,
  client: MuseOAuthClientRow | null
): ValidateAuthorizeResult {
  const clientState =
    typeof params.state === "string" && params.state.length > 0 ? params.state : null;
  const redirectUri =
    typeof params.redirect_uri === "string" ? params.redirect_uri : null;

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
  // only when it is exactly registered for this client.
  const usableRedirect =
    redirectUri && validateRedirectUri(client, redirectUri) ? redirectUri : null;
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
      errorDescription: "redirect_uri does not match the client's registered redirect URIs.",
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
  const scopes = parseMuseScopes(params.scope ?? null);
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
  return {
    ok: true,
    request: {
      client,
      redirectUri: usableRedirect,
      scopes,
      codeChallenge: params.code_challenge,
      clientState,
    },
  };
}

/** Builds an OAuth error redirect URL (error + description + state). */
export function buildOAuthErrorRedirect(
  redirectUri: string,
  error: string,
  errorDescription: string,
  clientState: string | null
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", errorDescription);
  if (clientState) url.searchParams.set("state", clientState);
  return url.toString();
}

/** Builds a successful authorize redirect URL (code + state). */
export function buildOAuthSuccessRedirect(
  redirectUri: string,
  code: string,
  clientState: string | null
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (clientState) url.searchParams.set("state", clientState);
  return url.toString();
}

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  workspaceId: string;
  scopes: MuseScope[];
  codeChallenge: string;
  redirectUri: string;
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
    expires_at: new Date(now.getTime() + MUSE_CODE_TTL_MS).toISOString(),
  });
  return code;
}
