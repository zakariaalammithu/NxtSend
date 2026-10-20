/**
 * OAuth service — the connect callback, disconnect, and Test
 * Connection logic behind the thin /api/oauth/* routes.
 *
 * Callback guarantees:
 *  - The signed state is verified against the CURRENT session's
 *    user + workspace before the code is touched.
 *  - The code is exchanged and the provider profile fetched; the
 *    connection exists only after BOTH succeed and the tokens are
 *    persisted (encrypted). ANY failure stores nothing — there is no
 *    partial "connected" state.
 *  - Connect/disconnect are written to audit_logs (best effort, the
 *    platform-server substrate) with the mailbox address — never
 *    with token material.
 *
 * Disconnect: the stored grant is deleted and the account record is
 * marked disconnected. For Google the access token is ALSO revoked
 * at Google (best effort — the outcome is reported truthfully).
 * Microsoft offers no simple revocation endpoint for this flow, so
 * disconnect there is exactly the local deletion + state; the
 * returned result says so.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOAuthClientConfig,
  getOAuthConfigStatus,
  OAUTH_PROVIDER_LABELS,
  type OAuthEnv,
} from "./config";
import { decryptToken } from "./crypto";
import { verifyOAuthState } from "./state";
import { createSupabaseOAuthStore } from "./store";
import { getValidAccessToken, OAuthTokenError } from "./tokens";
import type {
  OAuthProvider,
  OAuthTokenStore,
} from "./types";
import {
  exchangeGoogleCode,
  fetchGoogleProfile,
  revokeGoogleToken,
  OAuthProviderError,
} from "./google";
import { exchangeMicrosoftCode, fetchMicrosoftProfile } from "./microsoft";

export type OAuthFlowErrorCode =
  | "state_invalid"
  | "not_configured"
  | "exchange_failed"
  | "profile_failed"
  | "storage_failed";

export class OAuthFlowError extends Error {
  readonly code: OAuthFlowErrorCode;
  constructor(code: OAuthFlowErrorCode, message: string) {
    super(message);
    this.name = "OAuthFlowError";
    this.code = code;
  }
}

export interface OAuthServiceDeps {
  admin: SupabaseClient;
  /** Test seam: defaults to the Supabase store over `admin`. */
  store?: OAuthTokenStore;
  env?: OAuthEnv;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

function deps(args: OAuthServiceDeps): Required<
  Pick<OAuthServiceDeps, "store" | "env" | "fetchFn">
> &
  OAuthServiceDeps {
  return {
    ...args,
    store: args.store ?? createSupabaseOAuthStore(args.admin),
    env: args.env ?? (process.env as OAuthEnv),
    fetchFn: args.fetchFn ?? fetch,
  };
}

/** Best-effort audit write (migration-001 audit_logs, admin substrate). */
async function writeOAuthAudit(
  admin: SupabaseClient,
  entry: {
    actorId: string | null;
    action: string;
    provider: OAuthProvider;
    workspaceId: string;
    email: string;
    details: string;
  }
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      actor_id: entry.actorId,
      action: entry.action,
      resource: `oauth_connection:${entry.provider}`,
      metadata: {
        workspace_id: entry.workspaceId,
        provider: entry.provider,
        mailbox: entry.email,
        details: entry.details,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Audit is bookkeeping — the connect/disconnect outcome stands.
  }
}

// ── Callback ────────────────────────────────────────────────────────────────

export interface OAuthCallbackArgs {
  code: string;
  stateToken: string;
  /** The callback request's signed-in session identity. */
  userId: string;
  workspaceId: string;
}

export async function handleOAuthCallback(
  provider: OAuthProvider,
  args: OAuthCallbackArgs,
  rawDeps: OAuthServiceDeps
): Promise<{ email: string; accountId: string; connectionId: string }> {
  const d = deps(rawDeps);
  const label = OAUTH_PROVIDER_LABELS[provider];

  const claims = verifyOAuthState(
    args.stateToken,
    { provider, workspaceId: args.workspaceId, userId: args.userId },
    d.env,
    d.now ? d.now() : undefined
  );
  if (!claims) {
    throw new OAuthFlowError(
      "state_invalid",
      "The OAuth state did not verify (expired, tampered, or minted for a different account/workspace). Nothing was stored — start the connection again."
    );
  }

  const config = getOAuthClientConfig(provider, d.env);
  if (!config) {
    const status = getOAuthConfigStatus(provider, d.env);
    throw new OAuthFlowError(
      "not_configured",
      `${label} OAuth is not fully configured on the server (missing: ${status.missing.join(", ")}). Nothing was stored.`
    );
  }

  let tokens;
  try {
    tokens =
      provider === "google"
        ? await exchangeGoogleCode(config, args.code, d.fetchFn)
        : await exchangeMicrosoftCode(config, args.code, d.fetchFn);
  } catch (err) {
    throw new OAuthFlowError(
      "exchange_failed",
      err instanceof OAuthProviderError
        ? err.message
        : `The ${label} authorization code could not be exchanged. Nothing was stored.`
    );
  }

  let profile;
  try {
    profile =
      provider === "google"
        ? await fetchGoogleProfile(tokens.accessToken, d.fetchFn)
        : await fetchMicrosoftProfile(tokens.accessToken, d.fetchFn);
  } catch (err) {
    throw new OAuthFlowError(
      "profile_failed",
      err instanceof OAuthProviderError
        ? err.message
        : `The ${label} mailbox profile could not be fetched, so the connection was not recorded.`
    );
  }

  let persisted: { accountId: string; connectionId: string };
  try {
    persisted = await d.store.persistConnection({
      workspaceId: args.workspaceId,
      provider,
      profile,
      tokens: {
        ...tokens,
        // Record the granted scope string; fall back to the
        // requested set when the provider omits it (Google omits it
        // when it matches the request exactly on some flows).
        scope: tokens.scope,
      },
    });
  } catch (err) {
    throw new OAuthFlowError(
      "storage_failed",
      `The ${label} grant could not be stored (${err instanceof Error ? err.message : "unknown error"}). Nothing was connected.`
    );
  }

  await writeOAuthAudit(d.admin, {
    actorId: args.userId,
    action: "oauth_connected",
    provider,
    workspaceId: args.workspaceId,
    email: profile.email,
    details: `${label} mailbox ${profile.email} connected via OAuth.`,
  });

  return {
    email: profile.email,
    accountId: persisted.accountId,
    connectionId: persisted.connectionId,
  };
}

// ── Disconnect ──────────────────────────────────────────────────────────────

export interface OAuthDisconnectResult {
  provider: OAuthProvider;
  email: string;
  /** Google only: whether the provider accepted token revocation.
   *  Null for Microsoft (no revocation endpoint exists — the local
   *  grant deletion IS the disconnect; see the module header). */
  revokedAtProvider: boolean | null;
}

export async function disconnectOAuthConnection(
  args: { connectionId: string; workspaceId: string; userId: string | null },
  rawDeps: OAuthServiceDeps
): Promise<OAuthDisconnectResult> {
  const d = deps(rawDeps);
  const connection = await d.store.getConnectionById(
    args.workspaceId,
    args.connectionId
  );
  if (!connection) {
    throw new OAuthFlowError(
      "storage_failed",
      "That mailbox connection does not exist in this workspace (it may already be disconnected)."
    );
  }
  const label = OAUTH_PROVIDER_LABELS[connection.provider];

  let revokedAtProvider: boolean | null = null;
  if (connection.provider === "google") {
    // Revoke the refresh token when present (revoking it invalidates
    // the whole grant); otherwise the access token. Best effort.
    try {
      const tokenToRevoke = connection.refresh_token_enc
        ? decryptToken(connection.refresh_token_enc, d.env)
        : decryptToken(connection.access_token_enc, d.env);
      revokedAtProvider = await revokeGoogleToken(tokenToRevoke, d.fetchFn);
    } catch {
      revokedAtProvider = false;
    }
  }

  await d.store.deleteConnection(args.workspaceId, connection.id);
  await d.store.updateAccountAuth(connection.account_id, {
    auth_status: "not_connected",
    status: "disconnected",
    last_error: null,
  });

  await writeOAuthAudit(d.admin, {
    actorId: args.userId,
    action: "oauth_disconnected",
    provider: connection.provider,
    workspaceId: args.workspaceId,
    email: connection.provider_account_email,
    details:
      connection.provider === "google"
        ? `${label} mailbox ${connection.provider_account_email} disconnected; stored tokens deleted${revokedAtProvider ? " and the grant was revoked at Google" : " (Google revocation could not be confirmed — the local grant is deleted, so NxtSend can no longer use it)"}.`
        : `${label} mailbox ${connection.provider_account_email} disconnected; stored tokens deleted. Microsoft provides no revocation endpoint for this flow — remove the app's consent in the Microsoft account too if you want the grant gone there as well.`,
  });

  return {
    provider: connection.provider,
    email: connection.provider_account_email,
    revokedAtProvider,
  };
}

// ── Test Connection (Integration Center verify) ─────────────────────────────

export interface OAuthVerifyResult {
  attempted: boolean;
  ok: boolean;
  message: string;
}

/**
 * The REAL mailbox verification: load the workspace's connection,
 * obtain a valid access token (refreshing when needed), re-fetch
 * the provider profile, and confirm it still describes the connected
 * mailbox. No connection → attempted:false (nothing was called).
 */
export async function verifyOAuthConnection(
  provider: OAuthProvider,
  args: { workspaceId: string },
  rawDeps: OAuthServiceDeps
): Promise<OAuthVerifyResult> {
  const d = deps(rawDeps);
  const label = OAUTH_PROVIDER_LABELS[provider];

  const status = getOAuthConfigStatus(provider, d.env);
  if (!status.clientConfigured) {
    return {
      attempted: false,
      ok: false,
      message: `${label} OAuth client is not configured (missing: ${status.missing.join(", ")}) — no verification call was made.`,
    };
  }

  const views = await d.store.listConnectionViews(args.workspaceId);
  const view = views.find((v) => v.provider === provider);
  if (!view) {
    return {
      attempted: false,
      ok: false,
      message: `No ${label} mailbox is connected in this workspace yet — use Connect on this page first. No verification call was made.`,
    };
  }
  const connection = await d.store.getConnectionById(args.workspaceId, view.id);
  if (!connection) {
    return {
      attempted: false,
      ok: false,
      message: `The ${label} connection record could not be loaded. No verification call was made.`,
    };
  }

  try {
    const { accessToken } = await getValidAccessToken(
      { store: d.store, env: d.env, fetchFn: d.fetchFn, now: d.now },
      connection
    );
    const profile =
      provider === "google"
        ? await fetchGoogleProfile(accessToken, d.fetchFn)
        : await fetchMicrosoftProfile(accessToken, d.fetchFn);
    if (profile.email !== connection.provider_account_email) {
      return {
        attempted: true,
        ok: false,
        message: `${label} answered, but the grant now belongs to ${profile.email} instead of the connected mailbox ${connection.provider_account_email}. Reconnect the mailbox so the record matches the grant.`,
      };
    }
    await d.store.updateAccountAuth(connection.account_id, {
      auth_status: "ok",
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
    return {
      attempted: true,
      ok: true,
      message: `${label} verified: the stored grant is valid and the provider profile confirms the connected mailbox ${profile.email}.`,
    };
  } catch (err) {
    if (err instanceof OAuthTokenError) {
      return {
        attempted: true,
        ok: false,
        message: `${err.message} The mailbox needs to be reconnected.`,
      };
    }
    return {
      attempted: true,
      ok: false,
      message: err instanceof Error ? err.message : `${label} verification failed.`,
    };
  }
}
