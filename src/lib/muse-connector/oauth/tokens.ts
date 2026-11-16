/**
 * Muse OAuth tokens — issuance, verification, rotation, revocation.
 *
 * Pure logic over the MuseOAuthStore seam (./store.ts): no Supabase
 * here, no demo data. Tokens and codes are stored as SHA-256 hashes
 * ONLY — a database read can never yield a usable token, and no
 * plaintext token is ever logged.
 *
 * Lifetimes: access 1h, refresh 60d, authorization code 10 min.
 * Demo mode fails closed: verifyMuseAccessToken returns null whenever
 * the data mode is "demo" (the demo persona has userId null and must
 * never be served to Muse).
 */

import { createHash, randomBytes } from "crypto";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import type { MuseScope } from "./scopes";
import type { MuseOAuthStore } from "./store";

export const MUSE_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MUSE_REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
export const MUSE_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** SHA-256 hex of a token/code value — the only form ever stored. */
export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

export interface MuseGrant {
  clientId: string;
  userId: string;
  workspaceId: string;
  scopes: MuseScope[];
}

export interface MuseIssuedTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Issues a fresh access + refresh pair for a grant and stores both
 * as hashes. The returned plaintext values are shown to the caller
 * exactly once — the token endpoint response — and never again.
 */
export async function issueMuseTokens(
  store: MuseOAuthStore,
  grant: MuseGrant,
  now: Date = new Date()
): Promise<MuseIssuedTokens> {
  const accessToken = randomTokenValue();
  const refreshToken = randomTokenValue();
  await store.insertToken({
    token_hash: hashToken(accessToken),
    kind: "access",
    client_id: grant.clientId,
    user_id: grant.userId,
    workspace_id: grant.workspaceId,
    scopes: grant.scopes,
    expires_at: new Date(now.getTime() + MUSE_ACCESS_TOKEN_TTL_MS).toISOString(),
    revoked_at: null,
    rotated_from_hash: null,
  });
  await store.insertToken({
    token_hash: hashToken(refreshToken),
    kind: "refresh",
    client_id: grant.clientId,
    user_id: grant.userId,
    workspace_id: grant.workspaceId,
    scopes: grant.scopes,
    expires_at: new Date(now.getTime() + MUSE_REFRESH_TOKEN_TTL_MS).toISOString(),
    revoked_at: null,
    rotated_from_hash: null,
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: MUSE_ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: grant.scopes.join(" "),
  };
}

export interface MuseAccessContext {
  userId: string;
  workspaceId: string;
  scopes: MuseScope[];
  clientId: string;
  /**
   * Grant identifier — the client + user pair this token belongs to.
   * There is no separate grant row (migration 023); the pair is the
   * grant, and revoking a grant revokes every token for the pair.
   */
  grantId: string;
}

export interface VerifyMuseAccessDeps {
  store: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
}

/**
 * Verifies a Muse access token by hash lookup: kind must be
 * `access`, not revoked, not expired. Returns null for ANY problem,
 * including demo mode — fail closed, never serve the demo persona.
 */
export async function verifyMuseAccessToken(
  token: string | null | undefined,
  deps: VerifyMuseAccessDeps
): Promise<MuseAccessContext | null> {
  const mode = deps.mode ?? getDataMode();
  if (mode === "demo") return null;
  if (!token) return null;
  const now = deps.now ?? new Date();
  const row = await deps.store.getToken(hashToken(token));
  if (!row) return null;
  if (row.kind !== "access") return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null;
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    scopes: row.scopes,
    clientId: row.client_id,
    grantId: `${row.client_id}:${row.user_id}`,
  };
}

export type MuseTokenErrorCode = "invalid_grant" | "invalid_client" | "invalid_request";

export interface RotateRefreshDeps {
  store: MuseOAuthStore;
  now?: Date;
}

export type RotateRefreshResult =
  | { ok: true; tokens: MuseIssuedTokens; grant: MuseGrant }
  | { ok: false; error: MuseTokenErrorCode; grantRevoked: boolean; grant?: MuseGrant };

/**
 * Rotates a refresh token: the old one is revoked, a fresh pair is
 * issued, and the new refresh token records `rotated_from_hash` so a
 * later presentation of the old one is detectable as reuse.
 *
 * Reuse detection: presenting an already-revoked refresh token that
 * HAS a rotation successor means the token was already used once —
 * the grant is compromised, so the whole grant (all tokens for that
 * client + user) is revoked and the exchange is refused.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  deps: RotateRefreshDeps
): Promise<RotateRefreshResult> {
  const now = deps.now ?? new Date();
  const hash = hashToken(refreshToken);
  const row = await deps.store.getToken(hash);
  if (!row || row.kind !== "refresh") {
    return { ok: false, error: "invalid_grant", grantRevoked: false };
  }
  if (row.revoked_at) {
    const successor = await deps.store.getTokenRotatedFrom(hash);
    if (successor) {
      // Reuse of an already-rotated refresh token: revoke the grant.
      await deps.store.revokeGrant(row.client_id, row.user_id, now.toISOString());
      return {
        ok: false,
        error: "invalid_grant",
        grantRevoked: true,
        grant: {
          clientId: row.client_id,
          userId: row.user_id,
          workspaceId: row.workspace_id,
          scopes: row.scopes,
        },
      };
    }
    return { ok: false, error: "invalid_grant", grantRevoked: false };
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, error: "invalid_grant", grantRevoked: false };
  }
  const grant: MuseGrant = {
    clientId: row.client_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    scopes: row.scopes,
  };
  await deps.store.revokeToken(hash, now.toISOString());
  const tokens = await issueMuseTokens(deps.store, grant, now);
  // Link the new refresh token to the one it replaced, so a later
  // presentation of the old token is detectable as reuse.
  await deps.store.setRotatedFrom(hashToken(tokens.refresh_token), hash);
  return { ok: true, tokens, grant };
}

export interface RevokeTokenDeps {
  store: MuseOAuthStore;
  now?: Date;
}

/**
 * RFC 7009 revocation. Revoking a refresh token revokes the whole
 * grant; revoking an access token revokes just that token. Unknown
 * tokens are a no-op (the route still answers 200).
 */
export async function revokeMuseToken(
  token: string,
  deps: RevokeTokenDeps
): Promise<{
  revoked: boolean;
  grantRevoked: boolean;
  workspaceId: string | null;
  userId: string | null;
}> {
  const now = deps.now ?? new Date();
  const row = await deps.store.getToken(hashToken(token));
  if (!row) return { revoked: false, grantRevoked: false, workspaceId: null, userId: null };
  if (row.kind === "refresh") {
    await deps.store.revokeGrant(row.client_id, row.user_id, now.toISOString());
    return { revoked: true, grantRevoked: true, workspaceId: row.workspace_id, userId: row.user_id };
  }
  if (!row.revoked_at) {
    await deps.store.revokeToken(row.token_hash, now.toISOString());
  }
  return { revoked: true, grantRevoked: false, workspaceId: row.workspace_id, userId: row.user_id };
}
