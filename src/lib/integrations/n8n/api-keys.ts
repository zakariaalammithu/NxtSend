/**
 * n8n API keys — scoped, expirable, revocable keys for the n8n
 * REST API (migration 028: `nxtsend_api_keys`).
 *
 * Rules:
 *  - A key is `nxt_live_` + 32 base64url chars (24 random bytes).
 *    Only the SHA-256 hash of the full key is stored — the key
 *    value itself is returned exactly ONCE, at creation, and never
 *    again (not in lists, not in logs, never in `key_hash` form
 *    outside this module).
 *  - `key_prefix` is the first 8 chars (`nxt_live`) — enough to
 *    identify a key in the UI, useless for authenticating.
 *  - Scopes are `n8n.read` / `n8n.write` only (there is no
 *    `n8n.send` tier). Tiers are independent, like OAuth
 *    (`grantHasTier`): a key must hold the tier it needs — write
 *    does NOT imply read.
 *  - RLS is enabled with ZERO policies (service-role only, like
 *    the OAuth tables) — all access goes through this module with
 *    the admin client.
 *  - `resolveApiKey` never throws: a bad key, a revoked key, an
 *    expired key and a store failure all resolve to
 *    `{ok: false, reason}` so auth can answer 401.
 *  - `last_used_at` is updated best-effort on a successful
 *    resolve; a failure to write it never fails the call.
 */

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScopeTier } from "@/lib/muse-connector/oauth/scopes";

export type ApiKeyScope = "n8n.read" | "n8n.write";

export const API_KEY_SCOPES: readonly ApiKeyScope[] = ["n8n.read", "n8n.write"];

export const API_KEY_PREFIX = "nxt_live";
export const API_KEY_PREFIX_LENGTH = 8;

export interface ApiKeyRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What a list response carries — never the key, never the hash. */
export interface ApiKeyPublic {
  id: string;
  name: string;
  scopes: ApiKeyScope[];
  key_prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function toPublicApiKey(record: ApiKeyRecord): ApiKeyPublic {
  return {
    id: record.id,
    name: record.name,
    scopes: [...record.scopes],
    key_prefix: record.key_prefix,
    expires_at: record.expires_at,
    last_used_at: record.last_used_at,
    revoked_at: record.revoked_at,
    created_at: record.created_at,
  };
}

export interface ApiKeyStore {
  create(row: {
    workspace_id: string;
    user_id: string;
    name: string;
    key_hash: string;
    key_prefix: string;
    scopes: ApiKeyScope[];
    expires_at: string | null;
  }): Promise<ApiKeyRecord>;
  listByWorkspace(workspaceId: string): Promise<ApiKeyRecord[]>;
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  touchLastUsed(id: string, atIso: string): Promise<void>;
  revoke(id: string): Promise<ApiKeyRecord | null>;
}

type Row = Record<string, unknown>;

function rowToRecord(row: Row): ApiKeyRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    user_id: String(row.user_id),
    name: String(row.name),
    key_hash: String(row.key_hash),
    key_prefix: String(row.key_prefix),
    scopes: (Array.isArray(row.scopes) ? row.scopes : []) as ApiKeyScope[],
    expires_at: (row.expires_at as string | null) ?? null,
    last_used_at: (row.last_used_at as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createSupabaseApiKeyStore(admin: SupabaseClient): ApiKeyStore {
  return {
    async create(row) {
      const { data, error } = await admin
        .from("nxtsend_api_keys")
        .insert({
          workspace_id: row.workspace_id,
          user_id: row.user_id,
          name: row.name,
          key_hash: row.key_hash,
          key_prefix: row.key_prefix,
          scopes: row.scopes,
          expires_at: row.expires_at,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create API key: ${error?.message ?? "no row"}`);
      }
      return rowToRecord(data as Row);
    },

    async listByWorkspace(workspaceId) {
      const { data, error } = await admin
        .from("nxtsend_api_keys")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list API keys: ${error.message}`);
      return (data ?? []).map((r) => rowToRecord(r as Row));
    },

    async findByHash(keyHash) {
      const { data, error } = await admin
        .from("nxtsend_api_keys")
        .select("*")
        .eq("key_hash", keyHash)
        .maybeSingle();
      if (error) throw new Error(`Failed to look up API key: ${error.message}`);
      return data ? rowToRecord(data as Row) : null;
    },

    async touchLastUsed(id, atIso) {
      const { error } = await admin
        .from("nxtsend_api_keys")
        .update({ last_used_at: atIso, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to touch API key: ${error.message}`);
    },

    async revoke(id) {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("nxtsend_api_keys")
        .update({ revoked_at: now, updated_at: now })
        .eq("id", id)
        .is("revoked_at", null)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
      return data ? rowToRecord(data as Row) : null;
    },
  };
}

/** In-memory store for tests (and Demo Mode, where keys are refused anyway). */
export function createMemoryApiKeyStore(): ApiKeyStore {
  const records = new Map<string, ApiKeyRecord>();
  let counter = 0;
  return {
    async create(row) {
      counter += 1;
      const now = new Date().toISOString();
      const record: ApiKeyRecord = {
        id: `key_${counter}_${randomBytes(6).toString("hex")}`,
        ...row,
        last_used_at: null,
        revoked_at: null,
        created_at: now,
        updated_at: now,
      };
      records.set(record.id, record);
      return record;
    },
    async listByWorkspace(workspaceId) {
      return Array.from(records.values())
        .filter((r) => r.workspace_id === workspaceId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async findByHash(keyHash) {
      return Array.from(records.values()).find((r) => r.key_hash === keyHash) ?? null;
    },
    async touchLastUsed(id, atIso) {
      const record = records.get(id);
      if (record) records.set(id, { ...record, last_used_at: atIso });
    },
    async revoke(id) {
      const record = records.get(id);
      if (!record || record.revoked_at) return null;
      const revoked = { ...record, revoked_at: new Date().toISOString() };
      records.set(id, revoked);
      return revoked;
    },
  };
}

export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `${API_KEY_PREFIX}_${randomBytes(24).toString("base64url")}`;
  return { key, keyHash: hashApiKey(key), keyPrefix: key.slice(0, API_KEY_PREFIX_LENGTH) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** True when the key's scopes satisfy a tier (tiers are independent — write does NOT imply read). */
export function apiKeyHasTier(scopes: readonly string[], tier: ScopeTier): boolean {
  return scopes.includes(`n8n.${tier}`);
}

function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return value === "n8n.read" || value === "n8n.write";
}

/** A Supabase admin client or an ApiKeyStore — both work as a backend. */
export type ApiKeyBackend = SupabaseClient | ApiKeyStore;

function toStore(backend: ApiKeyBackend): ApiKeyStore {
  if (typeof (backend as SupabaseClient).from === "function") {
    return createSupabaseApiKeyStore(backend as SupabaseClient);
  }
  return backend as ApiKeyStore;
}

export interface CreateApiKeyInput {
  workspaceId: string;
  userId: string;
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
}

export type CreateApiKeyResult =
  | {
      ok: true;
      id: string;
      name: string;
      scopes: ApiKeyScope[];
      expires_at: string | null;
      created_at: string;
      /** The key value — returned ONLY here, never again. */
      key: string;
    }
  | { ok: false; error: string; code: string };

export async function createApiKey(
  backend: ApiKeyBackend,
  input: CreateApiKeyInput
): Promise<CreateApiKeyResult> {
  const name = input.name?.trim();
  if (!name) {
    return { ok: false, error: "name is required.", code: "invalid_params" };
  }
  const scopes = Array.isArray(input.scopes) ? input.scopes.filter(isApiKeyScope) : [];
  if (scopes.length === 0) {
    return {
      ok: false,
      error: "scopes must include at least one of: n8n.read, n8n.write.",
      code: "invalid_params",
    };
  }
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "expires_at must be an ISO 8601 timestamp.", code: "invalid_params" };
    }
    expiresAt = parsed.toISOString();
  }
  const { key, keyHash, keyPrefix } = generateApiKey();
  const store = toStore(backend);
  const record = await store.create({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    scopes: Array.from(new Set(scopes)),
    expires_at: expiresAt,
  });
  return {
    ok: true,
    id: record.id,
    name: record.name,
    scopes: record.scopes,
    expires_at: record.expires_at,
    created_at: record.created_at,
    key,
  };
}

export async function listApiKeys(
  backend: ApiKeyBackend,
  workspaceId: string
): Promise<ApiKeyPublic[]> {
  const store = toStore(backend);
  const records = await store.listByWorkspace(workspaceId);
  return records.map(toPublicApiKey);
}

export async function revokeApiKey(
  backend: ApiKeyBackend,
  workspaceId: string,
  id: string
): Promise<{ ok: true; id: string } | { ok: false; reason: "not_found" }> {
  const store = toStore(backend);
  const records = await store.listByWorkspace(workspaceId);
  if (!records.some((r) => r.id === id)) {
    return { ok: false, reason: "not_found" };
  }
  await store.revoke(id);
  return { ok: true, id };
}

export type ResolveApiKeyResult =
  | { ok: true; workspaceId: string; userId: string; scopes: ApiKeyScope[] }
  | { ok: false; reason: "invalid" | "revoked" | "expired" };

/**
 * Resolves a presented key value to its workspace/user/scopes.
 * Never throws — any failure (unknown hash, revoked, expired,
 * store error) resolves to `{ok: false, reason}`.
 */
export async function resolveApiKey(
  backend: ApiKeyBackend,
  key: string
): Promise<ResolveApiKeyResult> {
  try {
    const store = toStore(backend);
    const record = await store.findByHash(hashApiKey(key));
    if (!record) return { ok: false, reason: "invalid" };
    if (record.revoked_at) return { ok: false, reason: "revoked" };
    if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
    // Best-effort last-used stamp — never fails the call.
    try {
      await store.touchLastUsed(record.id, new Date().toISOString());
    } catch {
      // Ignored: last_used_at is telemetry, not auth.
    }
    return { ok: true, workspaceId: record.workspace_id, userId: record.user_id, scopes: record.scopes };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
