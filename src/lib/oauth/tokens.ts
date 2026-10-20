/**
 * Access-token lifecycle for stored OAuth grants.
 *
 * getValidAccessToken is the single path every consumer (mailbox
 * send adapters, Integration Center verify) uses:
 *   1. Decrypt the stored access token.
 *   2. If it expires within the refresh skew (60s) — or its expiry
 *      is unknown — refresh it against the provider with the stored
 *      refresh token, RE-ENCRYPT and persist the new set (a provider
 *      may rotate the refresh token; the new one is stored whenever
 *      issued), and use the fresh access token.
 *   3. If refresh is impossible (no refresh token, provider rejects,
 *      vault unreadable), the connection is marked
 *      `needs_reconnect` — connection row AND the account's recorded
 *      auth health (migration 013) — and an OAuthTokenError is
 *      thrown. Callers turn that into an honest error result; NO
 *      caller silently falls back to another sending path.
 */

import { decryptToken, encryptToken, TokenVaultError } from "./crypto";
import { getOAuthClientConfig, type OAuthEnv } from "./config";
import type { OAuthConnectionRow, OAuthTokenStore } from "./types";
import { refreshGoogleToken, OAuthProviderError } from "./google";
import { refreshMicrosoftToken } from "./microsoft";

export class OAuthTokenError extends Error {
  readonly code:
    | "refresh_failed"
    | "no_refresh_token"
    | "vault_unreadable"
    | "not_active";
  constructor(
    code: OAuthTokenError["code"],
    message: string
  ) {
    super(message);
    this.name = "OAuthTokenError";
    this.code = code;
  }
}

export const TOKEN_REFRESH_SKEW_MS = 60_000;

export interface ValidTokenDeps {
  store: OAuthTokenStore;
  env?: OAuthEnv;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

async function markNeedsReconnect(
  deps: ValidTokenDeps,
  connection: OAuthConnectionRow,
  reason: string
): Promise<void> {
  try {
    await deps.store.setConnectionStatus(connection.id, "needs_reconnect");
    await deps.store.updateAccountAuth(connection.account_id, {
      auth_status: "needs_reconnect",
      last_error: reason,
    });
  } catch {
    // The refusal stands even if the bookkeeping write fails — the
    // caller still gets the error and nothing is sent.
  }
}

export async function getValidAccessToken(
  deps: ValidTokenDeps,
  connection: OAuthConnectionRow
): Promise<{ accessToken: string; connection: OAuthConnectionRow }> {
  const env = deps.env ?? (process.env as OAuthEnv);
  const fetchFn = deps.fetchFn ?? fetch;
  const now = (deps.now ?? (() => new Date()))();

  if (connection.status !== "active") {
    throw new OAuthTokenError(
      "not_active",
      `The ${connection.provider === "google" ? "Gmail" : "Microsoft"} mailbox connection for ${connection.provider_account_email} is "${connection.status}", not active — reconnect the mailbox before sending.`
    );
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_enc, env);
  } catch (err) {
    const reason =
      err instanceof TokenVaultError
        ? err.message
        : "Stored OAuth token could not be decrypted.";
    await markNeedsReconnect(deps, connection, reason);
    throw new OAuthTokenError("vault_unreadable", reason);
  }

  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : null;
  const needsRefresh =
    expiresAt === null || expiresAt - now.getTime() <= TOKEN_REFRESH_SKEW_MS;
  if (!needsRefresh) return { accessToken, connection };

  // ── Refresh path ────────────────────────────────────────────────
  if (!connection.refresh_token_enc) {
    const reason = `The mailbox grant for ${connection.provider_account_email} has no refresh token, so the expired access token cannot be renewed — reconnect the mailbox.`;
    await markNeedsReconnect(deps, connection, reason);
    throw new OAuthTokenError("no_refresh_token", reason);
  }
  let refreshToken: string;
  try {
    refreshToken = decryptToken(connection.refresh_token_enc, env);
  } catch (err) {
    const reason =
      err instanceof TokenVaultError
        ? err.message
        : "Stored refresh token could not be decrypted.";
    await markNeedsReconnect(deps, connection, reason);
    throw new OAuthTokenError("vault_unreadable", reason);
  }

  const clientConfig = getOAuthClientConfig(connection.provider, env);
  if (!clientConfig) {
    const reason = `The OAuth client for ${connection.provider} is not fully configured on the server, so the access token cannot be refreshed.`;
    await markNeedsReconnect(deps, connection, reason);
    throw new OAuthTokenError("refresh_failed", reason);
  }

  try {
    const tokens =
      connection.provider === "google"
        ? await refreshGoogleToken(clientConfig, refreshToken, fetchFn)
        : await refreshMicrosoftToken(clientConfig, refreshToken, fetchFn);
    const tokenExpiresAt =
      tokens.expiresInSec != null
        ? new Date(now.getTime() + tokens.expiresInSec * 1000).toISOString()
        : null;
    await deps.store.updateTokens(connection.id, {
      accessTokenEnc: encryptToken(tokens.accessToken, env),
      // Providers may rotate the refresh token; when no new one is
      // issued, the stored one stays (undefined = leave unchanged).
      refreshTokenEnc: tokens.refreshToken
        ? encryptToken(tokens.refreshToken, env)
        : undefined,
      tokenExpiresAt,
    });
    return {
      accessToken: tokens.accessToken,
      connection: {
        ...connection,
        access_token_enc: encryptToken(tokens.accessToken, env),
        refresh_token_enc: tokens.refreshToken
          ? encryptToken(tokens.refreshToken, env)
          : connection.refresh_token_enc,
        token_expires_at: tokenExpiresAt,
      },
    };
  } catch (err) {
    const reason =
      err instanceof OAuthProviderError
        ? err.message
        : `Token refresh failed: ${err instanceof Error ? err.message : "unknown error"}.`;
    await markNeedsReconnect(deps, connection, reason);
    throw new OAuthTokenError("refresh_failed", reason);
  }
}
