/**
 * OAuth token store — Supabase service-role implementation.
 *
 * Reads/writes `oauth_connections` (migration 014) and the linked
 * `connected_accounts` identity rows through the SERVICE-ROLE client
 * only. The table has RLS enabled with zero client policies, so this
 * store is the only code path that can ever touch token material —
 * and it never returns ciphertext to a route: routes receive
 * OAuthConnectionMetadata (see toOAuthConnectionMetadata), which is
 * assembled field-by-field and contains no token fields at all.
 *
 * Tokens arrive at persistConnection as PLAINTEXT (straight from the
 * provider's token endpoint) and are encrypted with the vault
 * (./crypto.ts) before the write — plaintext never reaches the DB,
 * a log line, or a response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken } from "./crypto";
import { mailboxLabel } from "./types";
import type {
  OAuthConnectionMetadata,
  OAuthConnectionRow,
  OAuthProvider,
  OAuthTokenStore,
  PersistOAuthConnectionInput,
} from "./types";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";

type Row = Record<string, unknown>;

function rowToConnection(row: Row): OAuthConnectionRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    account_id: String(row.account_id),
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    provider_account_email: String(row.provider_account_email ?? ""),
    scopes: typeof row.scopes === "string" ? row.scopes : null,
    access_token_enc: String(row.access_token_enc ?? ""),
    refresh_token_enc:
      typeof row.refresh_token_enc === "string" && row.refresh_token_enc
        ? row.refresh_token_enc
        : null,
    token_expires_at:
      typeof row.token_expires_at === "string" && row.token_expires_at
        ? row.token_expires_at
        : null,
    status: (["active", "needs_reconnect", "disconnected", "error"].includes(
      String(row.status)
    )
      ? row.status
      : "error") as OAuthConnectionRow["status"],
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * The metadata mapper — the ONLY way a connection row may leave the
 * server. Field-by-field: id, account link, provider, mailbox
 * address, scopes, grant status, token EXPIRY (a timestamp, not a
 * token), the account's recorded auth health, timestamps. Token
 * ciphertext is never copied.
 */
export function toOAuthConnectionMetadata(
  row: OAuthConnectionRow,
  authStatus: string
): OAuthConnectionMetadata {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    email: row.provider_account_email,
    scopes: row.scopes,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    authStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseOAuthStore(
  admin: SupabaseClient
): OAuthTokenStore {
  return {
    async getConnectionById(workspaceId, connectionId) {
      const { data, error } = await admin
        .from("oauth_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", connectionId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load OAuth connection: ${error.message}`);
      }
      return data ? rowToConnection(data as Row) : null;
    },

    async getConnectionByAccountId(workspaceId, accountId) {
      const { data, error } = await admin
        .from("oauth_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load OAuth connection: ${error.message}`);
      }
      return data ? rowToConnection(data as Row) : null;
    },

    async listConnectionViews(workspaceId) {
      const { data, error } = await admin
        .from("oauth_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to list OAuth connections: ${error.message}`);
      }
      const rows = (data ?? []).map((r) => rowToConnection(r as Row));
      if (rows.length === 0) return [];
      const { data: accounts } = await admin
        .from("connected_accounts")
        .select("id, auth_status")
        .eq("workspace_id", workspaceId)
        .in(
          "id",
          rows.map((r) => r.account_id)
        );
      const authByAccount = new Map<string, string>();
      for (const a of accounts ?? []) {
        const r = a as Row;
        authByAccount.set(String(r.id), String(r.auth_status ?? "not_connected"));
      }
      return rows.map((row) =>
        toOAuthConnectionMetadata(
          row,
          authByAccount.get(row.account_id) ?? "not_connected"
        )
      );
    },

    async persistConnection(input: PersistOAuthConnectionInput) {
      const label = mailboxLabel(input.provider);
      const email = input.profile.email.trim().toLowerCase();
      const now = new Date().toISOString();
      const [firstName, ...restName] = (input.profile.displayName ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      // 1 · Find-or-create the sending identity (connected_accounts).
      const { data: existing, error: findError } = await admin
        .from("connected_accounts")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("channel", "email")
        .eq("provider", label)
        .eq("handle_or_email", email)
        .maybeSingle();
      if (findError) {
        throw new Error(`Failed to look up mailbox account: ${findError.message}`);
      }

      let accountId: string;
      if (existing) {
        accountId = String((existing as Row).id);
        const { error } = await admin
          .from("connected_accounts")
          .update({
            status: "connected",
            auth_status: "ok",
            provider_account_id: input.profile.providerAccountId,
            last_sync_at: now,
            last_error: null,
            updated_at: now,
          })
          .eq("id", accountId)
          .eq("workspace_id", input.workspaceId);
        if (error) {
          throw new Error(`Failed to update mailbox account: ${error.message}`);
        }
      } else {
        const { data: created, error } = await admin
          .from("connected_accounts")
          .insert({
            workspace_id: input.workspaceId,
            channel: "email",
            provider: label,
            display_name: input.profile.displayName?.trim() || email,
            handle_or_email: email,
            avatar_url: null,
            status: "connected",
            provider_account_id: input.profile.providerAccountId,
            auth_status: "ok",
            last_sync_at: now,
            last_error: null,
            warmup_enabled: false,
            daily_limits: { ...DEFAULT_WARMUP_LIMITS },
            sender_first_name: firstName ?? "",
            sender_last_name: restName.join(" "),
            sender_job_title: "",
            sender_company: "",
          })
          .select("id")
          .single();
        if (error) {
          throw new Error(`Failed to create mailbox account: ${error.message}`);
        }
        accountId = String((created as Row).id);
      }

      // 2 · Store the grant — tokens encrypted BEFORE the write.
      const tokenExpiresAt =
        input.tokens.expiresInSec != null
          ? new Date(Date.now() + input.tokens.expiresInSec * 1000).toISOString()
          : null;
      const grant = {
        workspace_id: input.workspaceId,
        account_id: accountId,
        provider: input.provider,
        provider_account_email: email,
        scopes: input.tokens.scope,
        access_token_enc: encryptToken(input.tokens.accessToken),
        refresh_token_enc: input.tokens.refreshToken
          ? encryptToken(input.tokens.refreshToken)
          : null,
        token_expires_at: tokenExpiresAt,
        status: "active",
        updated_at: now,
      };
      const { data: existingGrant } = await admin
        .from("oauth_connections")
        .select("id")
        .eq("account_id", accountId)
        .maybeSingle();
      if (existingGrant) {
        const connectionId = String((existingGrant as Row).id);
        const { error } = await admin
          .from("oauth_connections")
          .update(grant)
          .eq("id", connectionId);
        if (error) {
          throw new Error(`Failed to store OAuth tokens: ${error.message}`);
        }
        return { accountId, connectionId };
      }
      const { data: createdGrant, error } = await admin
        .from("oauth_connections")
        .insert(grant)
        .select("id")
        .single();
      if (error) {
        throw new Error(`Failed to store OAuth tokens: ${error.message}`);
      }
      return { accountId, connectionId: String((createdGrant as Row).id) };
    },

    async updateTokens(connectionId, patch) {
      const { error } = await admin
        .from("oauth_connections")
        .update({
          access_token_enc: patch.accessTokenEnc,
          ...(patch.refreshTokenEnc !== undefined
            ? { refresh_token_enc: patch.refreshTokenEnc }
            : {}),
          token_expires_at: patch.tokenExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (error) {
        throw new Error(`Failed to persist refreshed tokens: ${error.message}`);
      }
    },

    async setConnectionStatus(connectionId, status) {
      const { error } = await admin
        .from("oauth_connections")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", connectionId);
      if (error) {
        throw new Error(`Failed to update OAuth connection status: ${error.message}`);
      }
    },

    async updateAccountAuth(accountId, patch) {
      const dbPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.auth_status !== undefined) dbPatch.auth_status = patch.auth_status;
      if (patch.last_error !== undefined) dbPatch.last_error = patch.last_error;
      if (patch.last_sync_at !== undefined) dbPatch.last_sync_at = patch.last_sync_at;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      const { error } = await admin
        .from("connected_accounts")
        .update(dbPatch)
        .eq("id", accountId);
      if (error) {
        throw new Error(`Failed to update mailbox account health: ${error.message}`);
      }
    },

    async deleteConnection(workspaceId, connectionId) {
      const { error } = await admin
        .from("oauth_connections")
        .delete()
        .eq("id", connectionId)
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new Error(`Failed to delete OAuth connection: ${error.message}`);
      }
    },
  };
}

/** Per-provider mailbox summary for the Integration Center status. */
export interface OAuthMailboxSummary {
  email: string | null;
  authStatus: string | null;
  connectionStatus: OAuthConnectionMetadata["status"] | null;
}

/**
 * Reduces a workspace's connection metadata to one summary per
 * provider (the most recently updated connection wins). Pure —
 * unit-tested via the metadata mapper tests.
 */
export function summariseOAuthMailboxes(
  views: OAuthConnectionMetadata[]
): Record<OAuthProvider, OAuthMailboxSummary | null> {
  const best: Record<OAuthProvider, OAuthConnectionMetadata | null> = {
    google: null,
    microsoft: null,
  };
  for (const view of views) {
    const current = best[view.provider];
    if (!current || view.updatedAt >= current.updatedAt) {
      best[view.provider] = view;
    }
  }
  const out: Record<OAuthProvider, OAuthMailboxSummary | null> = {
    google: null,
    microsoft: null,
  };
  for (const provider of ["google", "microsoft"] as const) {
    const view = best[provider];
    if (view) {
      out[provider] = {
        email: view.email,
        authStatus: view.authStatus,
        connectionStatus: view.status,
      };
    }
  }
  return out;
}
