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
import type { OAuthScope } from "./oauth/scopes";
import {
  CHATGPT_OAUTH_CALLBACK,
  MUSE_OAUTH_CALLBACK,
} from "./oauth/clients";

/**
 * Which platform a grant's client belongs to, for the admin MCP
 * overview (grants by client origin). Classification is by the
 * client's identity, never by scope prefix alone:
 *   - a CIMD client_id is an https URL — chatgpt.com → ChatGPT,
 *     agent.meta.ai → Muse;
 *   - otherwise the registered redirect URIs decide (ChatGPT
 *     callback → ChatGPT, Muse callback → Muse);
 *   - anything else (e.g. loopback-only clients) is "Other".
 * A client carrying the ChatGPT callback wins over Muse when both
 * are listed (ChatGPT clients register both callbacks in practice
 * only when they serve both platforms; the ChatGPT one is the
 * distinguishing signal).
 */
export type GrantOrigin = "Muse" | "ChatGPT" | "Other";

export function grantOriginForClient(
  clientId: string,
  redirectUris: string[] = []
): GrantOrigin {
  if (redirectUris.includes(CHATGPT_OAUTH_CALLBACK)) return "ChatGPT";
  if (clientId.startsWith("https://")) {
    try {
      const origin = new URL(clientId).hostname.toLowerCase();
      if (origin === "chatgpt.com" || origin.endsWith(".chatgpt.com")) return "ChatGPT";
      if (origin === "agent.meta.ai" || origin.endsWith(".agent.meta.ai")) return "Muse";
    } catch {
      // Not a parseable URL — fall through to the redirect check.
    }
  }
  if (redirectUris.includes(MUSE_OAUTH_CALLBACK)) return "Muse";
  return "Other";
}

/** Active-grant counts split by client origin (admin overview). */
export interface GrantsByOrigin {
  muse: number;
  chatgpt: number;
  other: number;
  /** Distinct client + user pairs with a live refresh token, all origins. */
  total: number;
}

export const EMPTY_GRANTS_BY_ORIGIN: GrantsByOrigin = {
  muse: 0,
  chatgpt: 0,
  other: 0,
  total: 0,
};

/** Minimal live-token row the by-origin count needs (client + user pair). */
export interface GrantCountRow {
  client_id: string;
  user_id: string;
  kind: "access" | "refresh";
  expires_at: string;
  revoked_at: string | null;
  /** Granted scopes — fallback signal when the client origin is unknown (e.g. loopback-only clients). */
  scopes: string[];
}

/**
 * Pure grouping: live refresh-token rows (+ client rows) -> active
 * grant counts by origin (distinct client + user pairs). A CIMD
 * client has no stored client row, so its client_id URL is what
 * classifies it — see grantOriginForClient. Expired/revoked tokens
 * and access tokens never count.
 */
export function summarizeGrantsByOrigin(
  tokenRows: GrantCountRow[],
  clientRows: MuseOAuthClientRow[],
  now: Date = new Date()
): GrantsByOrigin {
  const redirectByClient = new Map(
    clientRows.map((c) => [c.client_id, c.redirect_uris ?? []])
  );
  const nowMs = now.getTime();
  const pairs = new Map<string, GrantOrigin>();
  for (const row of tokenRows) {
    if (row.kind !== "refresh") continue;
    if (row.revoked_at) continue;
    if (new Date(row.expires_at).getTime() <= nowMs) continue;
    const key = `${row.client_id}:${row.user_id}`;
    if (!pairs.has(key)) {
      // Client origin first; when it is unknown (e.g. a
      // loopback-only client with no stored platform signal),
      // the scope prefix is the fallback — nxtsend.* grants
      // belong to ChatGPT, muse.* grants to Muse.
      let origin = grantOriginForClient(row.client_id, redirectByClient.get(row.client_id) ?? []);
      if (origin === "Other") {
        if (row.scopes.some((s) => s.startsWith("nxtsend."))) origin = "ChatGPT";
        else if (row.scopes.some((s) => s.startsWith("muse."))) origin = "Muse";
      }
      pairs.set(key, origin);
    }
  }
  const out: GrantsByOrigin = { ...EMPTY_GRANTS_BY_ORIGIN };
  pairs.forEach((origin) => {
    if (origin === "Muse") out.muse += 1;
    else if (origin === "ChatGPT") out.chatgpt += 1;
    else out.other += 1;
  });
  out.total = pairs.size;
  return out;
}

/**
 * Counts ACTIVE grants (distinct client + user pairs with a live
 * refresh token) split by client origin. Optional workspace/user
 * filter, like countActiveMuseGrants. Returns null when the tables
 * cannot be read (e.g. migration 023 not applied); callers treat
 * null as "unknown", never as zero.
 */
export async function countActiveGrantsByOrigin(
  admin: SupabaseClient,
  filter: { workspaceId?: string; userId?: string } = {},
  now: Date = new Date()
): Promise<GrantsByOrigin | null> {
  try {
    let tokensQuery = admin
      .from("muse_oauth_tokens")
      .select("client_id, user_id, kind, scopes, expires_at, revoked_at")
      .eq("kind", "refresh")
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .limit(1000);
    if (filter.workspaceId) tokensQuery = tokensQuery.eq("workspace_id", filter.workspaceId);
    if (filter.userId) tokensQuery = tokensQuery.eq("user_id", filter.userId);
    const [tokens, clients] = await Promise.all([
      tokensQuery,
      admin
        .from("muse_oauth_clients")
        .select("id, client_id, client_secret_hash, name, redirect_uris, created_at")
        .order("created_at", { ascending: true }),
    ]);
    if (tokens.error || clients.error) return null;
    const rows: GrantCountRow[] = (tokens.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        client_id: String(row.client_id),
        user_id: String(row.user_id),
        kind: "refresh" as const,
        expires_at: String(row.expires_at),
        revoked_at: (row.revoked_at as string | null) ?? null,
        scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      };
    });
    const clientRows: MuseOAuthClientRow[] = (clients.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        client_id: String(row.client_id),
        client_secret_hash:
          typeof row.client_secret_hash === "string" && row.client_secret_hash
            ? row.client_secret_hash
            : null,
        name: String(row.name ?? ""),
        redirect_uris: Array.isArray(row.redirect_uris) ? (row.redirect_uris as string[]) : [],
        created_at: String(row.created_at ?? new Date().toISOString()),
      };
    });
    return summarizeGrantsByOrigin(rows, clientRows, now);
  } catch {
    return null;
  }
}

/** The safe token-row subset the grants source reads (no hashes). */
export interface MuseGrantTokenRow {
  client_id: string;
  kind: "access" | "refresh";
  scopes: OAuthScope[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface MuseGrantSummary {
  clientId: string;
  /** Client display name from muse_oauth_clients, or the client_id when unknown. */
  clientName: string;
  scopes: OAuthScope[];
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
    ).sort() as OAuthScope[];
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

function scopesOf(value: unknown): OAuthScope[] {
  return Array.isArray(value) ? (value as OAuthScope[]) : [];
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
