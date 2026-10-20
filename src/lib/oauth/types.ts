/**
 * OAuth mailbox module — shared types.
 *
 * Two OAuth providers exist: Google (Gmail mailboxes) and Microsoft
 * (Outlook / Microsoft 365 mailboxes). The `connected_accounts`
 * sending-identity rows carry provider labels "gmail" / "microsoft";
 * the OAuth layer names the identity providers "google" / "microsoft"
 * (the values stored in oauth_connections.provider, migration 014).
 *
 * HARD RULE: token material (plaintext or ciphertext) never crosses
 * into a UI/API payload. OAuthConnectionRow is a server-internal
 * shape; anything a route returns is OAuthConnectionMetadata, which
 * is built by an explicit field-by-field mapper (see ./store.ts).
 */

export type OAuthProvider = "google" | "microsoft";

/** The provider label used on connected_accounts rows + messages. */
export type MailboxProviderLabel = "gmail" | "microsoft";

export function mailboxLabel(provider: OAuthProvider): MailboxProviderLabel {
  return provider === "google" ? "gmail" : "microsoft";
}

export function oauthProviderForAccountLabel(
  label: string | null | undefined
): OAuthProvider | null {
  if (label === "gmail") return "google";
  if (label === "microsoft") return "microsoft";
  return null;
}

export type OAuthConnectionStatus =
  | "active"
  | "needs_reconnect"
  | "disconnected"
  | "error";

/** Full oauth_connections row — SERVER ONLY (contains ciphertext). */
export interface OAuthConnectionRow {
  id: string;
  workspace_id: string;
  account_id: string;
  provider: OAuthProvider;
  provider_account_email: string;
  scopes: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: OAuthConnectionStatus;
  created_at: string;
  updated_at: string;
}

/**
 * The ONLY connection shape an API route may return: metadata —
 * provider, mailbox address, grant status, token expiry, scopes.
 * No token fields exist on this type, by construction.
 */
export interface OAuthConnectionMetadata {
  id: string;
  accountId: string;
  provider: OAuthProvider;
  email: string;
  scopes: string | null;
  status: OAuthConnectionStatus;
  /** ISO timestamp the current access token expires (refresh is automatic). */
  tokenExpiresAt: string | null;
  /** The linked account's recorded authorization health (migration 013). */
  authStatus: string;
  createdAt: string;
  updatedAt: string;
}

/** A provider profile fetched AFTER a completed OAuth exchange. */
export interface OAuthProfile {
  /** The provider-side account id (Google `sub` / Microsoft `id`). */
  providerAccountId: string;
  /** The mailbox address mail is sent from (and shown to the user). */
  email: string;
  displayName: string | null;
}

/** A token set as returned by a provider token endpoint. */
export interface OAuthTokenSet {
  accessToken: string;
  /** Null when the provider did not issue a (new) refresh token. */
  refreshToken: string | null;
  /** Seconds until the access token expires, when reported. */
  expiresInSec: number | null;
  scope: string | null;
}

/** Input for persisting a completed OAuth connection. Tokens are
 *  PLAINTEXT here — the store encrypts them before any write. */
export interface PersistOAuthConnectionInput {
  workspaceId: string;
  provider: OAuthProvider;
  profile: OAuthProfile;
  tokens: OAuthTokenSet;
}

/**
 * The token-store contract the OAuth service + mailbox adapters
 * depend on (Supabase service-role implementation in ./store.ts;
 * in-memory fakes in tests). All methods are workspace-scoped except
 * the token refresh writer, which is keyed by connection id and only
 * ever called with a row the caller loaded workspace-scoped first.
 */
export interface OAuthTokenStore {
  getConnectionById(
    workspaceId: string,
    connectionId: string
  ): Promise<OAuthConnectionRow | null>;
  getConnectionByAccountId(
    workspaceId: string,
    accountId: string
  ): Promise<OAuthConnectionRow | null>;
  /** Metadata views for a workspace (joins the account's auth health). */
  listConnectionViews(
    workspaceId: string
  ): Promise<OAuthConnectionMetadata[]>;
  /**
   * Find-or-create the connected_accounts identity for the mailbox
   * and store the (encrypted) tokens. Returns both ids.
   */
  persistConnection(
    input: PersistOAuthConnectionInput
  ): Promise<{ accountId: string; connectionId: string }>;
  /** Persists refreshed tokens (already encrypted by the caller). */
  updateTokens(
    connectionId: string,
    patch: {
      accessTokenEnc: string;
      refreshTokenEnc?: string | null;
      tokenExpiresAt: string | null;
    }
  ): Promise<void>;
  setConnectionStatus(
    connectionId: string,
    status: OAuthConnectionStatus
  ): Promise<void>;
  /**
   * Marks the linked connected_accounts record's authorization health
   * (migration 013 fields) + optionally its record status.
   */
  updateAccountAuth(
    accountId: string,
    patch: {
      auth_status?: string;
      last_error?: string | null;
      last_sync_at?: string | null;
      status?: string;
    }
  ): Promise<void>;
  deleteConnection(workspaceId: string, connectionId: string): Promise<void>;
}
