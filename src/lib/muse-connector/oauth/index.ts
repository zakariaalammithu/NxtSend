/**
 * Muse OAuth 2.1 server — public surface of this module.
 *
 * The MCP worker imports `resolveMuseContext` from here (the exact
 * name and return shape are the cross-worker contract). Everything
 * else is the OAuth server's own core, used by the thin routes under
 * src/app/api/muse/oauth/.
 */

export {
  MUSE_SCOPES,
  NXT_SEND_SCOPES,
  CLAUDE_SCOPES,
  ALL_OAUTH_SCOPES,
  MUSE_SCOPE_DESCRIPTIONS,
  NXT_SEND_SCOPE_DESCRIPTIONS,
  CLAUDE_SCOPE_DESCRIPTIONS,
  SCOPE_DESCRIPTIONS,
  SCOPE_TIER_MAP,
  parseMuseScopes,
  normalizeScopes,
  isValidMuseScopeSubset,
  grantHasTier,
  scopeDescription,
  defaultScopeForPlatform,
} from "./scopes";
export type { MuseScope, NxtSendScope, ClaudeScope, OAuthScope, ScopeTier } from "./scopes";
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
  CHATGPT_OAUTH_CALLBACK,
  CLAUDE_OAUTH_CALLBACK,
  CLAUDE_COM_OAUTH_CALLBACK,
  CLAUDE_OAUTH_CALLBACKS,
  MUSE_MAX_CLIENTS,
  isAllowedMuseRedirectUri,
  isAllowedClaudeRedirectUri,
  isAllowedOAuthRedirectUri,
  isAllowedRedirectUriForPlatform,
  isLoopbackRedirectUri,
  isRegisteredRedirectUri,
  validateRedirectUri,
  validateRedirectUriForPlatform,
  verifyClientSecret,
  registerMuseClient,
  clientPlatform,
  platformLabel,
} from "./clients";
export type { OAuthClientPlatform } from "./clients";
export {
  isCimdClientId,
  validateCimdDocument,
  fetchCimdDocument,
  resolveCimdClient,
  clearCimdCache,
  CIMD_FETCH_TIMEOUT_MS,
  CIMD_MAX_BYTES,
  CIMD_CACHE_TTL_MS,
} from "./cimd";
export type { CimdDocument, ResolveCimdResult } from "./cimd";
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
export { isMuseMcpEnabled, isChatGptMcpEnabled, isClaudeMcpEnabled, getMusePublicUrl, getChatGptPublicUrl, getClaudePublicUrl, getOAuthIssuer, getMcpResourceUrl, canonicalMcpResources, resourcePlatform, DEFAULT_OAUTH_ORIGIN, MCP_RESOURCE_PATHS } from "./config";
export type { McpPlatform } from "./config";
export {
  handleMuseTokenRequest,
  handleMuseRevokeRequest,
  handleMuseRegisterRequest,
  createDcrRateLimiter,
  readOAuthFormBody,
  toNextResponse,
} from "./handlers";
