/**
 * Muse OAuth grants — user-facing listing + revocation (Worker C).
 *
 * A "grant" is the client + user pair (there is no separate grant
 * row in migration 023; see src/lib/muse-connector/oauth/tokens.ts).
 * A grant is ACTIVE while it holds at least one non-revoked,
 * unexpired refresh token.
 *
 * Security rules enforced here, not just in the route:
 *   - The Supabase source selects ONLY safe columns from
 *     `muse_oauth_tokens` (client_id, kind, scopes, expires_at,
 *     revoked_at, created_at). `token_hash` is NEVER selected, so a
 *     token value or hash can never reach a response, a log, or the
 *     browser — a database read must never yield a usable token.
 *   - `created_at` is the earliest token creation for the grant.
 *     "Last used" is NOT stored anywhere in migration 023, so it is
 *     reported as `lastUsedAt: null` with the reason, never invented.
 *   - Revocation goes through the OAuth store's `revokeGrant`
 *     (revokes every token for the client + user pair) — the same
 *     logic as RFC 7009 revocation of a refresh token.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuseOAuthClientRow, MuseOAuthStore } from "./oauth/store";
import type { MuseScope } from "./oauth/scopes";

/** The safe token-row subset the grants source reads (no hashes). */
export interface MuseGrantTokenRow {
  client_id: string;
  kind: "access" | "refresh";
  scopes: MuseScope[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface MuseGrantSummary {
  clientId: string;
  /** Client display name from muse_oauth_clients, or the client_id when unknown. */
  clientName: string;
  scopes: MuseScope[];
  /** Earliest token creation for this grant (ISO). */
  createdAt: string;
  /** Latest live refresh-token expiry for this grant (ISO), or null when none is live. */
  refreshExpiresAt: string | null;
  /** True while at least one refresh token is live (not revoked, not expired). */
  active: boolean;
  /**
   * Last use is NOT tracked by migration 023 — always null. Callers
   * must render "Not tracked" (or similar), never a guessed time.
   */
  lastUsedAt: null;
}

/**
 * Pure grouping: token rows (+ client names) -> one summary per
 * client. Rows for other users must already be filtered out by the
 * query; `userId` is not needed here because the summary carries no
 * user field. Expired/revoked-only grants are still listed with
 * `active: false` so a user can see (and revoke) a stale grant.
 */
export function summarizeMuseGrants(
  tokenRows: MuseGrantTokenRow[],
  clientRows: MuseOAuthClientRow[],
  now: Date = new Date()
): MuseGrantSummary[] {
  const names = new Map(clientRows.map((c) => [c.client_id, c.name]));
  const byClient = new Map<string, MuseGrantTokenRow[]>();
  for (const row of tokenRows) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(row);
    byClient.set(row.client_id, list);
  }
  const nowMs = now.getTime();
  const summaries: MuseGrantSummary[] = [];
  byClient.forEach((rows, clientId) => {
    const scopes = Array.from(
      new Set(rows.flatMap((r) => r.scopes))
    ).sort() as MuseScope[];
    const createdAt = rows
      .map((r) => r.created_at)
      .sort()
      .at(0) ?? new Date(nowMs).toISOString();
    const liveRefresh = rows.filter(
      (r) =>
        r.kind === "refresh" &&
        !r.revoked_at &&
        new Date(r.expires_at).getTime() > nowMs
    );
    const refreshExpiresAt =
      liveRefresh.length > 0
        ? liveRefresh.map((r) => r.expires_at).sort().at(-1) ?? null
        : null;
    summaries.push({
      clientId,
      clientName: names.get(clientId) ?? clientId,
      scopes,
      createdAt,
      refreshExpiresAt,
      active: liveRefresh.length > 0,
      lastUsedAt: null,
    });
  });
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return summaries;
}

/** Minimal data source the grants handlers need (injectable for tests). */
export interface MuseGrantsDataSource {
  listTokensForUser(userId: string): Promise<MuseGrantTokenRow[]>;
  listClients(): Promise<MuseOAuthClientRow[]>;
  revokeGrant(clientId: string, userId: string, revokedAt: string): Promise<void>;
}

function scopesOf(value: unknown): MuseScope[] {
  return Array.isArray(value) ? (value as MuseScope[]) : [];
}

/** Supabase-backed source (service role; migration 023 tables). */
export function createSupabaseMuseGrantsSource(admin: SupabaseClient): MuseGrantsDataSource {
  return {
    async listTokensForUser(userId) {
      const { data, error } = await admin
        .from("muse_oauth_tokens")
        .select("client_id, kind, scopes, expires_at, revoked_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(`Failed to list Muse OAuth grants: ${error.message}`);
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          client_id: String(r.client_id),
          kind: r.kind === "refresh" ? "refresh" : "access",
          scopes: scopesOf(r.scopes),
          expires_at: String(r.expires_at),
          revoked_at: (r.revoked_at as string | null) ?? null,
          created_at: String(r.created_at ?? new Date().toISOString()),
        } satisfies MuseGrantTokenRow;
      });
    },
    async listClients() {
      const { data, error } = await admin
        .from("muse_oauth_clients")
        .select("id, client_id, client_secret_hash, name, redirect_uris, created_at")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to list Muse OAuth clients: ${error.message}`);
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          client_id: String(r.client_id),
          client_secret_hash:
            typeof r.client_secret_hash === "string" && r.client_secret_hash
              ? r.client_secret_hash
              : null,
          name: String(r.name ?? ""),
          redirect_uris: Array.isArray(r.redirect_uris) ? (r.redirect_uris as string[]) : [],
          created_at: String(r.created_at ?? new Date().toISOString()),
        } satisfies MuseOAuthClientRow;
      });
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

export interface ListMuseGrantsDeps {
  source: MuseGrantsDataSource;
  now?: Date;
}

export async function listMuseGrants(
  userId: string,
  deps: ListMuseGrantsDeps
): Promise<MuseGrantSummary[]> {
  const [tokens, clients] = await Promise.all([
    deps.source.listTokensForUser(userId),
    deps.source.listClients(),
  ]);
  return summarizeMuseGrants(tokens, clients, deps.now ?? new Date());
}

export interface RevokeMuseGrantDeps {
  source: MuseGrantsDataSource;
  /** The OAuth store — revocation must go through it so the store seam stays the single revocation path. */
  store: MuseOAuthStore;
  now?: Date;
}

export type RevokeMuseGrantResult =
  | { ok: true; revoked: true }
  | { ok: false; error: "grant_not_found" };

/**
 * Revokes one grant (client + user). Returns `grant_not_found`
 * when the user holds no live token for that client — revoking an
 * already-dead grant is reported honestly instead of silently
 * succeeding.
 */
export async function revokeMuseGrant(
  clientId: string,
  userId: string,
  deps: RevokeMuseGrantDeps
): Promise<RevokeMuseGrantResult> {
  const now = deps.now ?? new Date();
  const tokens = await deps.source.listTokensForUser(userId);
  const live = tokens.some(
    (t) =>
      t.client_id === clientId &&
      !t.revoked_at &&
      new Date(t.expires_at).getTime() > now.getTime()
  );
  if (!live) return { ok: false, error: "grant_not_found" };
  await deps.store.revokeGrant(clientId, userId, now.toISOString());
  return { ok: true, revoked: true };
}

/**
 * Counts ACTIVE grants (distinct client + user pairs with a live
 * refresh token) for one workspace or one user. Used by the
 * Integration Center status and System Health — never for auth.
 * Returns null when the tables cannot be read (e.g. migration 023
 * not applied); callers treat null as "unknown", never as zero.
 */
export async function countActiveMuseGrants(
  admin: SupabaseClient,
  filter: { workspaceId?: string; userId?: string },
  now: Date = new Date()
): Promise<number | null> {
  try {
    let query = admin
      .from("muse_oauth_tokens")
      .select("client_id, user_id")
      .eq("kind", "refresh")
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .limit(1000);
    if (filter.workspaceId) query = query.eq("workspace_id", filter.workspaceId);
    if (filter.userId) query = query.eq("user_id", filter.userId);
    const { data, error } = await query;
    if (error) return null;
    const pairs = new Set(
      (data ?? []).map(
        (r) => `${String((r as Record<string, unknown>).client_id)}:${String((r as Record<string, unknown>).user_id)}`
      )
    );
    return pairs.size;
  } catch {
    return null;
  }
}
