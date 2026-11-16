/**
 * Muse OAuth endpoint handlers — token, revoke, register (pure core).
 *
 * Route files under src/app/api/muse/oauth/ are thin wrappers: they
 * build the Supabase store, parse the request, call one function
 * here, and convert the result to a NextResponse. Tests inject the
 * in-memory store (./store.ts) and a fake clock.
 *
 * Errors follow the OAuth standard (invalid_grant, invalid_client,
 * invalid_request, unsupported_grant_type, invalid_scope). No token,
 * code or secret material is ever echoed in an error.
 */

import { NextResponse } from "next/server";
import { SUPPORT_BODY_LIMIT_BYTES } from "@/lib/support/route-helpers";
import { verifyCodeChallenge } from "./pkce";
import { parseMuseScopes } from "./scopes";
import {
  hashToken,
  issueMuseTokens,
  rotateRefreshToken,
  revokeMuseToken,
  type MuseGrant,
  type MuseIssuedTokens,
} from "./tokens";
import { registerMuseClient, verifyClientSecret } from "./clients";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./store";
import type { MuseOAuthAuditAction } from "./audit";

export type MuseOAuthAuditFn = (event: {
  workspaceId: string | null;
  actorId: string | null;
  action: MuseOAuthAuditAction;
  resource: string;
  details: string;
}) => Promise<void>;

export interface MuseTokenHandlerDeps {
  store: MuseOAuthStore;
  now?: Date;
  audit?: MuseOAuthAuditFn;
}

export interface MuseHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

function oauthError(status: number, error: string, errorDescription: string): MuseHandlerResult {
  return { status, body: { error, error_description: errorDescription } };
}

/**
 * Parses an OAuth form body (application/x-www-form-urlencoded, the
 * standard encoding; JSON is also accepted). Enforces the shared
 * 64KB body cap. Returns null when the body is unreadable/oversize.
 */
export async function readOAuthFormBody(req: Request): Promise<URLSearchParams | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > SUPPORT_BODY_LIMIT_BYTES) return null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") params.set(k, v);
      }
      return params;
    } catch {
      return null;
    }
  }
  try {
    return new URLSearchParams(text);
  } catch {
    return null;
  }
}

interface ClientAuth {
  client: MuseOAuthClientRow | null;
  clientId: string | null;
  clientSecret: string | null;
}

/** Client auth from body params or HTTP Basic (RFC 6749 §2.3.1). */
export async function authenticateMuseClient(
  store: MuseOAuthStore,
  req: Request,
  params: URLSearchParams
): Promise<ClientAuth> {
  let clientId = params.get("client_id");
  let clientSecret = params.get("client_secret");
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon >= 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        clientSecret = decodeURIComponent(decoded.slice(colon + 1));
      }
    } catch {
      // Malformed Basic header — treated as no credentials below.
    }
  }
  if (!clientId) return { client: null, clientId: null, clientSecret };
  const client = await store.getClient(clientId);
  return { client, clientId, clientSecret };
}

function invalidClient(): MuseHandlerResult {
  return oauthError(401, "invalid_client", "Unknown client or invalid client authentication.");
}

// ── Token endpoint ──────────────────────────────────────────────────────────

async function exchangeCode(
  deps: MuseTokenHandlerDeps,
  client: MuseOAuthClientRow,
  params: URLSearchParams
): Promise<MuseHandlerResult> {
  const now = deps.now ?? new Date();
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const verifier = params.get("code_verifier");
  if (!code || !redirectUri || !verifier) {
    return oauthError(400, "invalid_request", "code, redirect_uri and code_verifier are required.");
  }
  const row = await deps.store.getCode(hashToken(code));
  if (!row) return oauthError(400, "invalid_grant", "The authorization code is invalid.");
  if (row.client_id !== client.client_id) {
    return oauthError(400, "invalid_grant", "The authorization code was issued to a different client.");
  }
  if (row.used_at) {
    return oauthError(400, "invalid_grant", "The authorization code has already been used.");
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return oauthError(400, "invalid_grant", "The authorization code has expired.");
  }
  if (row.redirect_uri !== redirectUri) {
    return oauthError(400, "invalid_grant", "redirect_uri does not match the authorize request.");
  }
  if (!verifyCodeChallenge(verifier, row.code_challenge)) {
    return oauthError(400, "invalid_grant", "PKCE code_verifier does not match the code_challenge.");
  }
  await deps.store.markCodeUsed(row.code_hash, now.toISOString());
  const grant: MuseGrant = {
    clientId: row.client_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    scopes: row.scopes,
  };
  const tokens = await issueMuseTokens(deps.store, grant, now);
  await deps.audit?.({
    workspaceId: row.workspace_id,
    actorId: row.user_id,
    action: "MUSE_OAUTH_TOKEN_EXCHANGE",
    resource: `muse_oauth_client:${row.client_id}`,
    details: `Authorization code exchanged for tokens (scopes: ${row.scopes.join(" ")}).`,
  });
  return { status: 200, body: tokenResponseBody(tokens) };
}

function tokenResponseBody(tokens: MuseIssuedTokens): Record<string, unknown> {
  return {
    access_token: tokens.access_token,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
  };
}

/**
 * POST /api/muse/oauth/token — grant_types `authorization_code`
 * (single-use code + PKCE S256 verifier) and `refresh_token`
 * (rotates on every use; reuse of an already-rotated refresh token
 * revokes the whole grant).
 */
export async function handleMuseTokenRequest(
  req: Request,
  deps: MuseTokenHandlerDeps
): Promise<MuseHandlerResult> {
  const params = await readOAuthFormBody(req);
  if (!params) return oauthError(400, "invalid_request", "Request body is missing or unreadable.");
  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
  }
  const { client, clientSecret } = await authenticateMuseClient(deps.store, req, params);
  if (!client) return invalidClient();
  if (!verifyClientSecret(client, clientSecret)) return invalidClient();

  if (grantType === "authorization_code") {
    return exchangeCode(deps, client, params);
  }
  const refreshToken = params.get("refresh_token");
  if (!refreshToken) {
    return oauthError(400, "invalid_request", "refresh_token is required.");
  }
  const result = await rotateRefreshToken(refreshToken, {
    store: deps.store,
    now: deps.now,
  });
  if (!result.ok) {
    if (result.grantRevoked && result.grant) {
      await deps.audit?.({
        workspaceId: result.grant.workspaceId,
        actorId: result.grant.userId,
        action: "MUSE_OAUTH_GRANT_REVOKED",
        resource: `muse_oauth_client:${client.client_id}`,
        details: "Refresh-token reuse detected: the whole grant was revoked.",
      });
    }
    return oauthError(400, "invalid_grant", "The refresh token is invalid, expired or already used.");
  }
  await deps.audit?.({
    workspaceId: result.grant.workspaceId,
    actorId: result.grant.userId,
    action: "MUSE_OAUTH_TOKEN_REFRESH",
    resource: `muse_oauth_client:${result.grant.clientId}`,
    details: "Refresh token rotated.",
  });
  return { status: 200, body: tokenResponseBody(result.tokens) };
}

// ── Revoke endpoint ─────────────────────────────────────────────────────────

export type MuseRevokeHandlerDeps = MuseTokenHandlerDeps;

/**
 * POST /api/muse/oauth/revoke (RFC 7009). Revoking a refresh token
 * revokes the whole grant. Always answers 200 for unknown tokens —
 * the caller learns nothing about whether a token existed.
 */
export async function handleMuseRevokeRequest(
  req: Request,
  deps: MuseRevokeHandlerDeps
): Promise<MuseHandlerResult> {
  const params = await readOAuthFormBody(req);
  if (!params) return oauthError(400, "invalid_request", "Request body is missing or unreadable.");
  const token = params.get("token");
  if (!token) return oauthError(400, "invalid_request", "token is required.");
  const { client, clientSecret } = await authenticateMuseClient(deps.store, req, params);
  if (!client) return invalidClient();
  if (!verifyClientSecret(client, clientSecret)) return invalidClient();
  const result = await revokeMuseToken(token, { store: deps.store, now: deps.now });
  if (result.revoked && result.workspaceId) {
    await deps.audit?.({
      workspaceId: result.workspaceId,
      actorId: result.userId,
      action: result.grantRevoked ? "MUSE_OAUTH_GRANT_REVOKED" : "MUSE_OAUTH_TOKEN_REVOKE",
      resource: `muse_oauth_client:${client.client_id}`,
      details: result.grantRevoked
        ? "Refresh token revoked: the whole grant was revoked."
        : "Access token revoked.",
    });
  }
  return { status: 200, body: {} };
}

// ── Register endpoint (DCR) ─────────────────────────────────────────────────

export interface DcrRateLimiter {
  check(key: string, nowMs: number): boolean;
}

/**
 * Token-bucket limiter for DCR: burst of 5, then 1 per 6 minutes
 * per key (per IP). Pure given an injected clock; in-memory, so
 * per-process on serverless — a best-effort brake, like the
 * submissions limiter (src/lib/admin/submissions-core.ts).
 */
export function createDcrRateLimiter(): DcrRateLimiter {
  const capacity = 5;
  const refillMs = 6 * 60 * 1000;
  const buckets = new Map<string, { tokens: number; lastRefillMs: number }>();
  return {
    check(key: string, nowMs: number): boolean {
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: nowMs };
      const elapsed = nowMs - bucket.lastRefillMs;
      if (elapsed >= refillMs) {
        const refills = Math.floor(elapsed / refillMs);
        bucket.tokens = Math.min(capacity, bucket.tokens + refills);
        bucket.lastRefillMs += refills * refillMs;
      }
      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return true;
    },
  };
}

export function dcrClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface MuseRegisterHandlerDeps {
  store: MuseOAuthStore;
  limiter: DcrRateLimiter;
  now?: Date;
  audit?: MuseOAuthAuditFn;
}

/**
 * POST /api/muse/oauth/register (RFC 7591). Accepts `client_name`
 * + `redirect_uris` only — every other field is ignored. Default
 * public client (no secret); a confidential client is created only
 * when `token_endpoint_auth_method` is explicitly
 * `client_secret_post` or `client_secret_basic`.
 */
export async function handleMuseRegisterRequest(
  req: Request,
  deps: MuseRegisterHandlerDeps
): Promise<MuseHandlerResult> {
  const now = deps.now ?? new Date();
  if (!deps.limiter.check(dcrClientKey(req), now.getTime())) {
    return {
      status: 429,
      body: { error: "temporarily_unavailable", error_description: "Too many registration attempts from this address. Please try again later." },
    };
  }
  const text = await req.text().catch(() => null);
  if (text === null || text.length > SUPPORT_BODY_LIMIT_BYTES) {
    return oauthError(400, "invalid_client_metadata", "Request body is missing or too large.");
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return oauthError(400, "invalid_client_metadata", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return oauthError(400, "invalid_client_metadata", "Request body must be a JSON object.");
  }
  const authMethod = body.token_endpoint_auth_method;
  const confidential =
    authMethod === "client_secret_post" || authMethod === "client_secret_basic";
  const result = await registerMuseClient(
    deps.store,
    {
      name: body.client_name,
      redirectUris: body.redirect_uris,
      confidential,
    },
    now
  );
  if (!result.ok) {
    const status = result.error === "too_many_clients" ? 429 : 400;
    return oauthError(status, result.error, result.detail);
  }
  // Scopes are validated at authorize time, not registration — but
  // echo the known scope set so the client knows what it may ask for.
  const response: Record<string, unknown> = {
    client_id: result.client.client_id,
    client_name: result.client.name,
    redirect_uris: result.client.redirect_uris,
    token_endpoint_auth_method: confidential ? "client_secret_post" : "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: parseMuseScopes(null)?.join(" ") ?? "muse.read",
  };
  if (result.clientSecret) {
    response.client_secret = result.clientSecret;
  }
  await deps.audit?.({
    workspaceId: null,
    actorId: null,
    action: "MUSE_OAUTH_CLIENT_REGISTER",
    resource: `muse_oauth_client:${result.client.client_id}`,
    details: `Client registered (${confidential ? "confidential" : "public"}): ${result.client.name}.`,
  });
  return { status: 201, body: response };
}

/** Converts a handler result to a NextResponse (thin-route helper). */
export function toNextResponse(result: MuseHandlerResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}
