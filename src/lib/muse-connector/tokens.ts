/**
 * Muse OAuth access-token verification — re-export shim over Worker A's
 * real OAuth server (src/lib/muse-connector/oauth/).
 *
 * Worker B originally stubbed this file (no OAuth server existed when
 * the MCP work started); Worker A has since landed the real server,
 * so this file now re-exports A's implementation instead of the stub.
 * The MCP server and adapter import verification through here, so the
 * contract path (`@/lib/muse-connector/tokens`) stays as specified
 * while the behaviour is A's real, hash-only token lookup.
 *
 * Contract (stable — A's oauth/tokens.ts is the source of truth):
 *   verifyMuseAccessToken(token, { store, mode?, now? }) ->
 *     Promise<MuseAccessContext | null>
 *   (null when the token is unknown, expired, revoked, not an access
 *   token, or the mode is demo.)
 *   MuseGrantContext is the MCP worker's alias for MuseAccessContext:
 *   { userId, workspaceId, scopes, clientId, grantId }.
 */

import { getDataMode } from "@/lib/data/mode";

export {
  hashToken,
  issueMuseTokens,
  verifyMuseAccessToken,
  rotateRefreshToken,
  revokeMuseToken,
  MUSE_ACCESS_TOKEN_TTL_MS,
  MUSE_REFRESH_TOKEN_TTL_MS,
  MUSE_CODE_TTL_MS,
} from "./oauth/tokens";
export type {
  MuseGrant,
  MuseIssuedTokens,
  MuseAccessContext,
} from "./oauth/tokens";
export type { VerifyMuseAccessDeps } from "./oauth/tokens";

/** MCP worker's alias for A's MuseAccessContext (same shape). */
export type { MuseAccessContext as MuseGrantContext } from "./oauth/tokens";

/**
 * Whether Muse OAuth can actually verify a token in this deployment:
 * true only in live (Supabase) mode, where the OAuth store exists.
 * Demo mode fails closed (verifyMuseAccessToken returns null), so
 * this is false there. It does NOT prove migration 023 has been
 * applied to the live project — a missing table still fails closed
 * at verification time (null context -> 401), never open.
 */
export function isMuseOAuthConfigured(): boolean {
  return getDataMode() === "supabase";
}

/** Backwards-compatible snapshot of isMuseOAuthConfigured() at import time. */
export const MUSE_OAUTH_CONFIGURED: boolean = isMuseOAuthConfigured();
