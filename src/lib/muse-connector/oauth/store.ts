/**
 * Muse OAuth store — the seam between the pure core logic and
 * Supabase (migration 023).
 *
 * The pure logic (tokens.ts, clients.ts, authorize.ts) talks ONLY to
 * this interface, so unit tests inject the in-memory store below and
 * the route handlers inject the Supabase store. No Supabase import
 * lives in the pure logic, and no token/code/secret plaintext ever
 * reaches a store method — callers hash first (see tokens.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthScope } from "./scopes";

export interface MuseOAuthClientRow {
  id: string;
  client_id: string;
  /** SHA-256 hex of the client secret, or null for public clients. */
  client_secret_hash: string | null;
  name: string;
  redirect_uris: string[];
  created_at: string;
}

export interface MuseOAuthCodeRow {
  code_hash: string;
  client_id: string;
  user_id: string;
  workspace_id: string;
  scopes: OAuthScope[];
  code_challenge: string;
  redirect_uri: string;
  /** RFC 8707 resource the code is bound to (full MCP resource URL), or null for legacy rows. */
  resource: string | null;
  expires_at: string;
  used_at: string | null;
}

export interface MuseOAuthTokenRow {
  token_hash: string;
  kind: "access" | "refresh";
  client_id: string;
  user_id: string;
  workspace_id: string;
  scopes: OAuthScope[];
  /** RFC 8707 audience the token is bound to (full MCP resource URL), or null for legacy rows. */
  resource: string | null;
  expires_at: string;
  revoked_at: string | null;
  rotated_from_hash: string | null;
}

export interface MuseOAuthStore {
  getClient(clientId: string): Promise<MuseOAuthClientRow | null>;
  createClient(row: Omit<MuseOAuthClientRow, "id" | "created_at">): Promise<MuseOAuthClientRow>;
  listClients(): Promise<MuseOAuthClientRow[]>;
  deleteClient(clientId: string): Promise<void>;
  /** True when any code or token was ever issued for this client. */
  clientHasActivity(clientId: string): Promise<boolean>;
  insertCode(row: Omit<MuseOAuthCodeRow, "used_at">): Promise<void>;
  getCode(codeHash: string): Promise<MuseOAuthCodeRow | null>;
  markCodeUsed(codeHash: string, usedAt: string): Promise<void>;
  insertToken(row: MuseOAuthTokenRow): Promise<void>;
  getToken(tokenHash: string): Promise<MuseOAuthTokenRow | null>;
  /** Finds a refresh token issued as the rotation successor of `hash`. */
  getTokenRotatedFrom(hash: string): Promise<MuseOAuthTokenRow | null>;
  /** Records which refresh token a newly issued one rotated from. */
  setRotatedFrom(tokenHash: string, rotatedFromHash: string): Promise<void>;
  revokeToken(tokenHash: string, revokedAt: string): Promise<void>;
  /** Revokes every token for one client + user (grant revocation). */
  revokeGrant(clientId: string, userId: string, revokedAt: string): Promise<void>;
}

// ── In-memory store (tests; also the shape a future demo store would take) ──

type Row = Record<string, unknown>;

function scopesOf(value: unknown): OAuthScope[] {
  return Array.isArray(value) ? (value as OAuthScope[]) : [];
}

function resourceOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createMemoryMuseOAuthStore(nowFn: () => Date = () => new Date()): MuseOAuthStore {
  const clients = new Map<string, MuseOAuthClientRow>();
  const codes = new Map<string, MuseOAuthCodeRow>();
  const tokens = new Map<string, MuseOAuthTokenRow>();
  let seq = 0;

  return {
    async getClient(clientId) {
      return clients.get(clientId) ?? null;
    },
    async createClient(row) {
      seq += 1;
      const created: MuseOAuthClientRow = {
        id: `memory-${seq}`,
        created_at: nowFn().toISOString(),
        ...row,
      };
      clients.set(created.client_id, created);
      return created;
    },
    async listClients() {
      return Array.from(clients.values()).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
    },
    async deleteClient(clientId) {
      clients.delete(clientId);
    },
    async clientHasActivity(clientId) {
      return (
        Array.from(codes.values()).some((code) => code.client_id === clientId) ||
        Array.from(tokens.values()).some((token) => token.client_id === clientId)
      );
    },
    async insertCode(row) {
      codes.set(row.code_hash, { ...row, used_at: null });
    },
    async getCode(codeHash) {
      return codes.get(codeHash) ?? null;
    },
    async markCodeUsed(codeHash, usedAt) {
      const row = codes.get(codeHash);
      if (row) codes.set(codeHash, { ...row, used_at: usedAt });
    },
    async insertToken(row) {
      tokens.set(row.token_hash, { ...row });
    },
    async getToken(tokenHash) {
      return tokens.get(tokenHash) ?? null;
    },
    async getTokenRotatedFrom(hash) {
      return (
        Array.from(tokens.values()).find((token) => token.rotated_from_hash === hash) ?? null
      );
    },
    async setRotatedFrom(tokenHash, rotatedFromHash) {
      const row = tokens.get(tokenHash);
      if (row) tokens.set(tokenHash, { ...row, rotated_from_hash: rotatedFromHash });
    },
    async revokeToken(tokenHash, revokedAt) {
      const row = tokens.get(tokenHash);
      if (row) tokens.set(tokenHash, { ...row, revoked_at: revokedAt });
    },
    async revokeGrant(clientId, userId, revokedAt) {
      tokens.forEach((token, hash) => {
        if (token.client_id === clientId && token.user_id === userId && !token.revoked_at) {
          tokens.set(hash, { ...token, revoked_at: revokedAt });
        }
      });
    },
  };
}

// ── Supabase store (service-role only; migration 023 tables) ───────────────

function rowToClient(row: Row): MuseOAuthClientRow {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    client_secret_hash:
      typeof row.client_secret_hash === "string" && row.client_secret_hash
        ? row.client_secret_hash
        : null,
    name: String(row.name ?? ""),
    redirect_uris: Array.isArray(row.redirect_uris)
      ? (row.redirect_uris as string[])
      : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToCode(row: Row): MuseOAuthCodeRow {
  return {
    code_hash: String(row.code_hash),
    client_id: String(row.client_id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    scopes: scopesOf(row.scopes),
    code_challenge: String(row.code_challenge ?? ""),
    redirect_uri: String(row.redirect_uri ?? ""),
    resource: resourceOf(row.resource),
    expires_at: String(row.expires_at),
    used_at: (row.used_at as string | null) ?? null,
  };
}

function rowToToken(row: Row): MuseOAuthTokenRow {
  return {
    token_hash: String(row.token_hash),
    kind: row.kind === "refresh" ? "refresh" : "access",
    client_id: String(row.client_id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    scopes: scopesOf(row.scopes),
    resource: resourceOf(row.resource),
    expires_at: String(row.expires_at),
    revoked_at: (row.revoked_at as string | null) ?? null,
    rotated_from_hash: (row.rotated_from_hash as string | null) ?? null,
  };
}

/**
 * Inserts a row carrying a `resource` value. Migration 024 adds
 * the `resource` column; when a deployment has not applied it yet
 * the insert fails on the unknown column — in that case retry
 * without the column so issuance keeps working (the token then
 * carries no audience and verifies against the default Muse
 * resource, exactly like a legacy token). Any other error is
 * rethrown.
 */
async function insertWithResourceFallback(
  admin: SupabaseClient,
  table: "muse_oauth_codes" | "muse_oauth_tokens",
  row: Record<string, unknown>,
  failureLabel: string
): Promise<void> {
  const { error } = await admin.from(table).insert(row);
  if (!error) return;
  if (typeof error.message === "string" && error.message.includes("resource")) {
    const { resource: _dropped, ...withoutResource } = row;
    void _dropped;
    const retry = await admin.from(table).insert(withoutResource);
    if (!retry.error) return;
    throw new Error(`Failed to store ${failureLabel}: ${retry.error.message}`);
  }
  throw new Error(`Failed to store ${failureLabel}: ${error.message}`);
}

export function createSupabaseMuseOAuthStore(admin: SupabaseClient): MuseOAuthStore {
  return {
    async getClient(clientId) {
      const { data, error } = await admin
        .from("muse_oauth_clients")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Muse OAuth client: ${error.message}`);
      return data ? rowToClient(data as Row) : null;
    },
    async createClient(row) {
      const { data, error } = await admin
        .from("muse_oauth_clients")
        .insert({
          client_id: row.client_id,
          client_secret_hash: row.client_secret_hash,
          name: row.name,
          redirect_uris: row.redirect_uris,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to register Muse OAuth client: ${error?.message ?? "no row"}`);
      }
      return rowToClient(data as Row);
    },
    async listClients() {
      const { data, error } = await admin
        .from("muse_oauth_clients")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to list Muse OAuth clients: ${error.message}`);
      return (data ?? []).map((r) => rowToClient(r as Row));
    },
    async deleteClient(clientId) {
      const { error } = await admin
        .from("muse_oauth_clients")
        .delete()
        .eq("client_id", clientId);
      if (error) throw new Error(`Failed to delete Muse OAuth client: ${error.message}`);
    },
    async clientHasActivity(clientId) {
      const { data: code, error: codeError } = await admin
        .from("muse_oauth_codes")
        .select("code_hash")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();
      if (codeError) throw new Error(`Failed to check Muse OAuth activity: ${codeError.message}`);
      if (code) return true;
      const { data: token, error: tokenError } = await admin
        .from("muse_oauth_tokens")
        .select("token_hash")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();
      if (tokenError) throw new Error(`Failed to check Muse OAuth activity: ${tokenError.message}`);
      return Boolean(token);
    },
    async insertCode(row) {
      await insertWithResourceFallback(admin, "muse_oauth_codes", {
        code_hash: row.code_hash,
        client_id: row.client_id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        scopes: row.scopes,
        code_challenge: row.code_challenge,
        redirect_uri: row.redirect_uri,
        resource: row.resource,
        expires_at: row.expires_at,
      }, "Muse authorization code");
    },
    async getCode(codeHash) {
      const { data, error } = await admin
        .from("muse_oauth_codes")
        .select("*")
        .eq("code_hash", codeHash)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Muse authorization code: ${error.message}`);
      return data ? rowToCode(data as Row) : null;
    },
    async markCodeUsed(codeHash, usedAt) {
      const { error } = await admin
        .from("muse_oauth_codes")
        .update({ used_at: usedAt })
        .eq("code_hash", codeHash);
      if (error) throw new Error(`Failed to mark Muse authorization code used: ${error.message}`);
    },
    async insertToken(row) {
      await insertWithResourceFallback(admin, "muse_oauth_tokens", {
        token_hash: row.token_hash,
        kind: row.kind,
        client_id: row.client_id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        scopes: row.scopes,
        resource: row.resource,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        rotated_from_hash: row.rotated_from_hash,
      }, "Muse OAuth token");
    },
    async getToken(tokenHash) {
      const { data, error } = await admin
        .from("muse_oauth_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Muse OAuth token: ${error.message}`);
      return data ? rowToToken(data as Row) : null;
    },
    async getTokenRotatedFrom(hash) {
      const { data, error } = await admin
        .from("muse_oauth_tokens")
        .select("*")
        .eq("rotated_from_hash", hash)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to load rotated Muse OAuth token: ${error.message}`);
      return data ? rowToToken(data as Row) : null;
    },
    async setRotatedFrom(tokenHash, rotatedFromHash) {
      const { error } = await admin
        .from("muse_oauth_tokens")
        .update({ rotated_from_hash: rotatedFromHash })
        .eq("token_hash", tokenHash);
      if (error) throw new Error(`Failed to link rotated Muse OAuth token: ${error.message}`);
    },
    async revokeToken(tokenHash, revokedAt) {
      const { error } = await admin
        .from("muse_oauth_tokens")
        .update({ revoked_at: revokedAt })
        .eq("token_hash", tokenHash);
      if (error) throw new Error(`Failed to revoke Muse OAuth token: ${error.message}`);
    },
    async revokeGrant(clientId, userId, revokedAt) {
      const { error } = await admin
        .from("muse_oauth_tokens")
        .update({ revoked_at: revokedAt })
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (error) throw new Error(`Failed to revoke Muse OAuth grant: ${error.message}`);
    },
  };
}
