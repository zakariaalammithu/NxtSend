/**
 * Muse OAuth 2.1 server — public surface of this module.
 *
 * The MCP worker imports `resolveMuseContext` from here (the exact
 * name and return shape are the cross-worker contract). Everything
 * else is the OAuth server's own core, used by the thin routes under
 * src/app/api/muse/oauth/.
 */

export { MUSE_SCOPES, MUSE_SCOPE_DESCRIPTIONS, parseMuseScopes, isValidMuseScopeSubset } from "./scopes";
export type { MuseScope } from "./scopes";
export { computeCodeChallenge, verifyCodeChallenge, isS256Method } from "./pkce";
export {
  hashToken,
  issueMuseTokens,
  verifyMuseAccessToken,
  rotateRefreshToken,
  revokeMuseToken,
  MUSE_ACCESS_TOKEN_TTL_MS,
  MUSE_REFRESH_TOKEN_TTL_MS,
  MUSE_CODE_TTL_MS,
} from "./tokens";
export type { MuseGrant, MuseIssuedTokens, MuseAccessContext } from "./tokens";
export {
  createMemoryMuseOAuthStore,
  createSupabaseMuseOAuthStore,
} from "./store";
export type { MuseOAuthStore, MuseOAuthClientRow, MuseOAuthCodeRow, MuseOAuthTokenRow } from "./store";
export {
  MUSE_OAUTH_CALLBACK,
  MUSE_MAX_CLIENTS,
  isAllowedMuseRedirectUri,
  isRegisteredRedirectUri,
  validateRedirectUri,
  verifyClientSecret,
  registerMuseClient,
} from "./clients";
export { signMuseAuthorizeState, verifyMuseAuthorizeState, MUSE_AUTHORIZE_STATE_TTL_MS } from "./state";
export type { MuseAuthorizeStateClaims } from "./state";
export {
  validateAuthorizeRequest,
  buildOAuthErrorRedirect,
  buildOAuthSuccessRedirect,
  issueAuthorizationCode,
} from "./authorize";
export type { AuthorizeParams, ValidAuthorizeRequest } from "./authorize";
export { resolveMuseContext } from "./context";
export type { ResolveMuseContextDeps } from "./context";
export { recordMuseOAuthEvent } from "./audit";
export type { MuseOAuthAuditAction } from "./audit";
export { isMuseMcpEnabled, getMusePublicUrl } from "./config";
export {
  handleMuseTokenRequest,
  handleMuseRevokeRequest,
  handleMuseRegisterRequest,
  createDcrRateLimiter,
  readOAuthFormBody,
  toNextResponse,
} from "./handlers";
