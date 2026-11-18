/**
 * Provider connections — helpers over `integration_connections`
 * (migration 030).
 *
 * Security rules (same as the OAuth tables, migrations 014/023):
 *  - Credentials are stored ONLY as ciphertext from `encryptToken`
 *    (AES-256-GCM, keyed by TOKEN_ENCRYPTION_KEY) — never plaintext,
 *    never a hash of a usable token, never in a log.
 *  - `getProviderConnection` / `listProviderConnections` return the
 *    PUBLIC shape only: they never carry a credential, decrypted or
 *    encrypted. `hasCredentials` is a boolean, not the blob.
 *  - `getDecryptedProviderCredential` is SERVER-ONLY: adapters call
 *    it to build auth headers. It must never feed a route response.
 *  - RLS is enabled with ZERO policies (service-role only) — all
 *    access goes through the store passed in here, built on the
 *    admin client.
 *
 * The store is an interface (same pattern as the n8n API-key
 * module): `createSupabaseProviderConnectionStore(admin)` for
 * production, `createMemoryProviderConnectionStore()` for tests.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/oauth/crypto";
import type {
  ProviderAuthType,
  ProviderConnectionStatus,
} from "./types";

/** What an adapter stores for one provider. Serialised to JSON, then encrypted. */
export interface ProviderCredential {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  /** ISO expiry of the access token, when the provider reports one. */
  expiresAt?: string | null;
  extra?: Record<string, string>;
}

/** Public connection record — safe to serialise to the frontend. */
export interface ProviderConnection {
  id: string;
  workspaceId: string;
  provider: string;
  authType: ProviderAuthType;
  status: ProviderConnectionStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when an encrypted credential blob is stored. Never the credential itself. */
  hasCredentials: boolean;
  /**
   * Expiry of the stored credential, when the caller knows it (from
   * decrypted metadata). Null means unknown — the expiry lives
   * inside the encrypted blob and is only known after decryption,
   * so a DB-only read reports null here rather than guessing.
   */
  credentialExpiresAt: string | null;
}

type Row = Record<string, unknown>;

export interface ProviderConnectionStore {
  find(workspaceId: string, provider: string): Promise<Row | null>;
  listByWorkspace(workspaceId: string): Promise<Row[]>;
  upsert(row: {
    workspace_id: string;
    provider: string;
    auth_type: string;
    encrypted_credentials: string | null;
    status: string;
  }): Promise<Row>;
  updateStatus(
    id: string,
    patch: { status: string; last_error: string | null }
  ): Promise<Row | null>;
}

function rowToConnection(row: Row): ProviderConnection {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    provider: String(row.provider),
    authType: String(row.auth_type) as ProviderAuthType,
    status: String(row.status) as ProviderConnectionStatus,
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasCredentials: Boolean(row.encrypted_credentials),
    credentialExpiresAt: null,
  };
}

export function createSupabaseProviderConnectionStore(
  admin: SupabaseClient
): ProviderConnectionStore {
  return {
    async find(workspaceId, provider) {
      const { data, error } = await admin
        .from("integration_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw new Error(`Failed to read provider connection: ${error.message}`);
      return (data as Row | null) ?? null;
    },
    async listByWorkspace(workspaceId) {
      const { data, error } = await admin
        .from("integration_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("provider", { ascending: true });
      if (error) throw new Error(`Failed to list provider connections: ${error.message}`);
      return (data as Row[] | null) ?? [];
    },
    async upsert(row) {
      const { data, error } = await admin
        .from("integration_connections")
        .upsert(row, { onConflict: "workspace_id,provider" })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to save provider connection: ${error?.message ?? "no row"}`);
      }
      return data as Row;
    },
    async updateStatus(id, patch) {
      const { data, error } = await admin
        .from("integration_connections")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Failed to update provider connection: ${error.message}`);
      return (data as Row | null) ?? null;
    },
  };
}

/** In-memory store for tests — never used in production. */
export function createMemoryProviderConnectionStore(): ProviderConnectionStore {
  const rows = new Map<string, Row>();
  const key = (workspaceId: string, provider: string) => `${workspaceId}:${provider}`;
  return {
    async find(workspaceId, provider) {
      return rows.get(key(workspaceId, provider)) ?? null;
    },
    async listByWorkspace(workspaceId) {
      return Array.from(rows.values())
        .filter((r) => r.workspace_id === workspaceId)
        .sort((a, b) => String(a.provider).localeCompare(String(b.provider)));
    },
    async upsert(row) {
      const k = key(row.workspace_id, row.provider);
      const existing = rows.get(k);
      const now = new Date().toISOString();
      const next: Row = {
        id: existing?.id ?? randomUUID(),
        workspace_id: row.workspace_id,
        provider: row.provider,
        auth_type: row.auth_type,
        // A status-only upsert (no credentials) keeps the stored blob.
        encrypted_credentials:
          row.encrypted_credentials ?? (existing?.encrypted_credentials as string | null) ?? null,
        status: row.status,
        last_sync_at: existing?.last_sync_at ?? null,
        last_error: existing?.last_error ?? null,
        created_at: (existing?.created_at as string) ?? now,
        updated_at: now,
      };
      rows.set(k, next);
      return next;
    },
    async updateStatus(id, patch) {
      for (const [k, row] of Array.from(rows.entries())) {
        if (row.id === id) {
          const next = { ...row, ...patch, updated_at: new Date().toISOString() };
          rows.set(k, next);
          return next;
        }
      }
      return null;
    },
  };
}

export interface UpsertProviderConnectionInput {
  workspaceId: string;
  provider: string;
  authType: ProviderAuthType;
  /** When supplied, the credential is encrypted and stored. Omit for a status-only upsert. */
  credentials?: ProviderCredential;
  status?: ProviderConnectionStatus;
}

/**
 * Creates or updates a provider connection. Credentials are
 * encrypted with `encryptToken` before they touch the store — a
 * missing/malformed TOKEN_ENCRYPTION_KEY throws here, before any
 * write, so nothing is ever stored in plaintext.
 */
export async function upsertProviderConnection(
  store: ProviderConnectionStore,
  input: UpsertProviderConnectionInput
): Promise<ProviderConnection> {
  const encrypted =
    input.credentials !== undefined
      ? encryptToken(JSON.stringify(input.credentials))
      : null;
  const status =
    input.status ?? (input.credentials !== undefined ? "connected" : "disconnected");
  const row = await store.upsert({
    workspace_id: input.workspaceId,
    provider: input.provider,
    auth_type: input.authType,
    encrypted_credentials: encrypted,
    status,
  });
  const connection = rowToConnection(row);
  // The caller just supplied the credential, so its expiry is known
  // without another decryption round-trip.
  connection.credentialExpiresAt = input.credentials?.expiresAt ?? null;
  return connection;
}

export async function getProviderConnection(
  store: ProviderConnectionStore,
  workspaceId: string,
  provider: string
): Promise<ProviderConnection | null> {
  const row = await store.find(workspaceId, provider);
  return row ? rowToConnection(row) : null;
}

export async function listProviderConnections(
  store: ProviderConnectionStore,
  workspaceId: string
): Promise<ProviderConnection[]> {
  const rows = await store.listByWorkspace(workspaceId);
  return rows.map(rowToConnection);
}

/** Records a provider failure: status → "error" with the message kept for the operator. */
export async function markProviderConnectionError(
  store: ProviderConnectionStore,
  workspaceId: string,
  provider: string,
  message: string
): Promise<ProviderConnection | null> {
  const row = await store.find(workspaceId, provider);
  if (!row) return null;
  const updated = await store.updateStatus(String(row.id), {
    status: "error",
    last_error: message,
  });
  return updated ? rowToConnection(updated) : null;
}

/**
 * SERVER-ONLY. Decrypts the stored credential for one provider so
 * an adapter can build auth headers. Never call this from a route
 * handler that serialises its result, and never log the return
 * value. Returns null when no connection or no credential is stored.
 */
export async function getDecryptedProviderCredential(
  store: ProviderConnectionStore,
  workspaceId: string,
  provider: string
): Promise<ProviderCredential | null> {
  const row = await store.find(workspaceId, provider);
  const blob = row?.encrypted_credentials as string | null | undefined;
  if (!blob) return null;
  const plaintext = decryptToken(blob);
  try {
    return JSON.parse(plaintext) as ProviderCredential;
  } catch {
    // Legacy shape: a bare token string rather than a JSON object.
    return { accessToken: plaintext };
  }
}
