/**
 * OAuth mailbox module entry point (server-side only).
 *
 * Gmail / Outlook (Microsoft 365) mailbox connections: AES-256-GCM
 * token vault (crypto.ts), provider clients (google.ts /
 * microsoft.ts), the connect/disconnect/verify service (service.ts),
 * and the service-role token store (store.ts). Tokens never leave
 * this module except as provider API Authorization headers.
 */

export * from "./types";
export {
  encryptToken,
  decryptToken,
  getTokenEncryptionKey,
  isTokenEncryptionConfigured,
  TokenVaultError,
  TOKEN_KEY_GENERATION_HINT,
} from "./crypto";
export type { TokenVaultEnv } from "./crypto";
export {
  getOAuthConfigStatus,
  getOAuthClientConfig,
  resolveOAuthRedirectUri,
  OAUTH_CALLBACK_PATHS,
  OAUTH_PROVIDER_LABELS,
  GOOGLE_SCOPES,
  MICROSOFT_SCOPES,
} from "./config";
export type {
  OAuthEnv,
  OAuthClientConfig,
  OAuthConfigStatus,
  OAuthRedirectResolution,
} from "./config";
export { signOAuthState, verifyOAuthState, OAUTH_STATE_TTL_MS } from "./state";
export type { OAuthStateClaims } from "./state";
export {
  createSupabaseOAuthStore,
  toOAuthConnectionMetadata,
  summariseOAuthMailboxes,
} from "./store";
export type { OAuthMailboxSummary } from "./store";
export { getValidAccessToken, OAuthTokenError, TOKEN_REFRESH_SKEW_MS } from "./tokens";
export {
  handleOAuthCallback,
  disconnectOAuthConnection,
  verifyOAuthConnection,
  OAuthFlowError,
} from "./service";
export type {
  OAuthServiceDeps,
  OAuthCallbackArgs,
  OAuthDisconnectResult,
  OAuthVerifyResult,
  OAuthFlowErrorCode,
} from "./service";
export {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  fetchGoogleProfile,
  revokeGoogleToken,
  OAuthProviderError,
} from "./google";
export {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  fetchMicrosoftProfile,
} from "./microsoft";
