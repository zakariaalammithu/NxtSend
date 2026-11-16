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
import { DEFAULT_OAUTH_ORIGIN, getMcpResourceUrl } from "./config";
import type { OAuthScope } from "./scopes";
import type { MuseOAuthStore } from "./store";

export const MUSE_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MUSE_REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
export const MUSE_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Zapier refresh grace window (10 minutes). Zapier may re-present
 * a refresh token it already rotated (its auto-refresh can race a
 * retry / re-run the same exchange); without a grace window that
 * re-presentation would look like token theft and revoke the whole
 * grant, breaking the Zapier connection on a normal retry. Within
 * the window, re-presenting an already-rotated Zapier refresh token
 * rotates AGAIN from the current successor instead of revoking.
 * This applies ONLY to Zapier grants (zapier.* scope or the Zapier
 * resource) — Muse/ChatGPT/Claude keep strict reuse-revokes-grant.
 * Tradeoff, stated plainly: inside the window a stolen Zapier
 * refresh token could also be exchanged once more instead of
 * triggering revocation. The window is short, the token is still
 * single-use per rotation step, and the grant is revoked on any
 * reuse outside the window — accepted because the alternative
 * (Zapier connections dying on routine retries) breaks the
 * integration in normal use.
 */
export const ZAPIER_REFRESH_GRACE_MS = 10 * 60 * 1000;

/** True when a grant belongs to Zapier (scope prefix or resource path). */
export function isZapierGrant(scopes: string[], resource: string | null | undefined): boolean {
  if (scopes.some((s) => s.startsWith("zapier."))) return true;
  if (!resource) return false;
  try {
    return new URL(resource).pathname.replace(/\/+$/, "") === "/api/integrations/zapier";
  } catch {
    return false;
  }
}

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
  scopes: OAuthScope[];
  /** RFC 8707 resource the grant is bound to (full MCP resource URL), or null for legacy grants. */
  resource?: string | null;
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
 * Both tokens are stored bound to the grant's `resource` (audience);
 * a grant with no resource stores null (legacy behaviour — see
 * verifyMuseAccessToken for how such tokens verify).
 */
export async function issueMuseTokens(
  store: MuseOAuthStore,
  grant: MuseGrant,
  now: Date = new Date()
): Promise<MuseIssuedTokens> {
  const accessToken = randomTokenValue();
  const refreshToken = randomTokenValue();
  const resource = grant.resource ?? null;
  await store.insertToken({
    token_hash: hashToken(accessToken),
    kind: "access",
    client_id: grant.clientId,
    user_id: grant.userId,
    workspace_id: grant.workspaceId,
    scopes: grant.scopes,
    resource,
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
    resource,
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
  scopes: OAuthScope[];
  clientId: string;
  /**
   * Grant identifier — the client + user pair this token belongs to.
   * There is no separate grant row (migration 023); the pair is the
   * grant, and revoking a grant revokes every token for the pair.
   */
  grantId: string;
  /**
   * Effective audience of this token (the RFC 8707 resource it is
   * bound to). Legacy tokens stored with no resource report the
   * canonical Muse resource for the origin.
   */
  resource: string;
}

export interface VerifyMuseAccessDeps {
  store: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
  /**
   * Expected audience (the resource being called, e.g.
   * `https://nxtsend.com/api/mcp/chatgpt`). When provided, a token
   * whose audience differs is refused. When omitted, no audience
   * check is done and the token's effective audience is reported
   * in the context. Callers at an MCP boundary MUST pass it.
   */
  resource?: string | null;
  /** Origin used to resolve the audience of legacy (resource-less) tokens. */
  origin?: string;
}

/**
 * Verifies a Muse access token by hash lookup: kind must be
 * `access`, not revoked, not expired, and (when an expected
 * resource is given) bound to that resource. Returns null for ANY
 * problem, including demo mode — fail closed, never serve the demo
 * persona. A token issued for /api/mcp/chatgpt never verifies for
 * /api/mcp, and vice versa.
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
  // Effective audience: the stored resource, or — for legacy tokens
  // issued before resource binding — the canonical Muse resource
  // for this origin.
  const origin = deps.origin ?? DEFAULT_OAUTH_ORIGIN;
  const effectiveResource = row.resource ?? getMcpResourceUrl(origin, "muse");
  if (deps.resource && deps.resource !== effectiveResource) return null;
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    scopes: row.scopes,
    clientId: row.client_id,
    grantId: `${row.client_id}:${row.user_id}`,
    resource: effectiveResource,
  };
}

export type MuseTokenErrorCode = "invalid_grant" | "invalid_client" | "invalid_request";

export interface RotateRefreshDeps {
  store: MuseOAuthStore;
  now?: Date;
  /**
   * Grace window (ms) for re-presented Zapier refresh tokens.
   * Defaults to ZAPIER_REFRESH_GRACE_MS. Pass 0 to disable the
   * grace (strict reuse-revokes-grant for every platform).
   */
  zapierGraceMs?: number;
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
 * client + user) is revoked and the exchange is refused. EXCEPTION:
 * Zapier grants (see ZAPIER_REFRESH_GRACE_MS) — a re-presentation
 * within the grace window rotates again from the successor instead
 * of revoking, because Zapier re-presents rotated refresh tokens
 * during routine retries.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  deps: RotateRefreshDeps
): Promise<RotateRefreshResult> {
  const now = deps.now ?? new Date();
  const graceMs = deps.zapierGraceMs ?? ZAPIER_REFRESH_GRACE_MS;
  const hash = hashToken(refreshToken);
  const row = await deps.store.getToken(hash);
  if (!row || row.kind !== "refresh") {
    return { ok: false, error: "invalid_grant", grantRevoked: false };
  }
  if (row.revoked_at) {
    const successor = await deps.store.getTokenRotatedFrom(hash);
    if (successor) {
      // Zapier grace: a recently-rotated Zapier refresh token
      // re-presented within the window rotates again from the
      // live successor instead of revoking the grant.
      const revokedAtMs = new Date(row.revoked_at).getTime();
      const successorLive =
        !successor.revoked_at &&
        new Date(successor.expires_at).getTime() > now.getTime();
      if (
        graceMs > 0 &&
        successorLive &&
        isZapierGrant(row.scopes, row.resource) &&
        now.getTime() - revokedAtMs <= graceMs
      ) {
        const grant: MuseGrant = {
          clientId: successor.client_id,
          userId: successor.user_id,
          workspaceId: successor.workspace_id,
          scopes: successor.scopes,
          resource: successor.resource,
        };
        await deps.store.revokeToken(successor.token_hash, now.toISOString());
        const tokens = await issueMuseTokens(deps.store, grant, now);
        await deps.store.setRotatedFrom(hashToken(tokens.refresh_token), successor.token_hash);
        return { ok: true, tokens, grant };
      }
      // Genuine reuse (or an expired grace window): revoke the grant.
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
          resource: row.resource,
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
    resource: row.resource,
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
