/**
 * Sync jobs — helpers over `integration_sync_jobs` (migration 030),
 * plus lead dedupe for import/export.
 *
 * A job is created `pending`, runs (adapters update it via
 * `finishSyncJob` / `recordSyncError`), and ends `completed` or
 * `failed`. `finishSyncJob` derives the final status from the
 * counts: any failure → "failed", otherwise "completed".
 *
 * The store is an interface (same pattern as the n8n API-key
 * module and `./connections`): `createSupabaseSyncJobStore(admin)`
 * for production, `createMemorySyncJobStore()` for tests.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/data/duplicates";
import type { SyncJobStatus, SyncResult } from "./types";

export type SyncDirection = "import" | "export";

export interface SyncJob {
  id: string;
  workspaceId: string;
  provider: string;
  direction: SyncDirection;
  status: SyncJobStatus;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;

export interface SyncJobStore {
  insert(row: {
    workspace_id: string;
    provider: string;
    direction: string;
    status: string;
  }): Promise<Row>;
  find(id: string): Promise<Row | null>;
  update(id: string, patch: Record<string, unknown>): Promise<Row | null>;
  listByWorkspace(workspaceId: string, provider?: string): Promise<Row[]>;
}

function rowToJob(row: Row): SyncJob {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    provider: String(row.provider),
    direction: String(row.direction) as SyncDirection,
    status: String(row.status) as SyncJobStatus,
    processed: Number(row.processed ?? 0),
    created: Number(row.created_count ?? 0),
    updated: Number(row.updated_count ?? 0),
    skipped: Number(row.skipped_count ?? 0),
    failed: Number(row.failed_count ?? 0),
    errors: Array.isArray(row.errors) ? (row.errors as string[]) : [],
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export function createSupabaseSyncJobStore(admin: SupabaseClient): SyncJobStore {
  return {
    async insert(row) {
      const { data, error } = await admin
        .from("integration_sync_jobs")
        .insert(row)
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create sync job: ${error?.message ?? "no row"}`);
      }
      return data as Row;
    },
    async find(id) {
      const { data, error } = await admin
        .from("integration_sync_jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Failed to read sync job: ${error.message}`);
      return (data as Row | null) ?? null;
    },
    async update(id, patch) {
      const { data, error } = await admin
        .from("integration_sync_jobs")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Failed to update sync job: ${error.message}`);
      return (data as Row | null) ?? null;
    },
    async listByWorkspace(workspaceId, provider) {
      let query = admin
        .from("integration_sync_jobs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (provider) query = query.eq("provider", provider);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to list sync jobs: ${error.message}`);
      return (data as Row[] | null) ?? [];
    },
  };
}

/** In-memory store for tests — never used in production. */
export function createMemorySyncJobStore(): SyncJobStore {
  const rows = new Map<string, Row>();
  return {
    async insert(row) {
      const now = new Date().toISOString();
      const next: Row = {
        id: randomUUID(),
        workspace_id: row.workspace_id,
        provider: row.provider,
        direction: row.direction,
        status: row.status,
        processed: 0,
        created_count: 0,
        updated_count: 0,
        skipped_count: 0,
        failed_count: 0,
        errors: [],
        started_at: null,
        finished_at: null,
        created_at: now,
      };
      rows.set(String(next.id), next);
      return next;
    },
    async find(id) {
      return rows.get(id) ?? null;
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      const next = { ...row, ...patch };
      rows.set(id, next);
      return next;
    },
    async listByWorkspace(workspaceId, provider) {
      return Array.from(rows.values())
        .filter(
          (r) =>
            r.workspace_id === workspaceId &&
            (provider === undefined || r.provider === provider)
        )
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },
  };
}

export async function createSyncJob(
  store: SyncJobStore,
  input: { workspaceId: string; provider: string; direction: SyncDirection }
): Promise<SyncJob> {
  const row = await store.insert({
    workspace_id: input.workspaceId,
    provider: input.provider,
    direction: input.direction,
    status: "pending",
  });
  return rowToJob(row);
}

/**
 * Closes a job with its final counts. The job is "failed" when
 * anything failed or any error was recorded, otherwise "completed".
 * Returns the updated job, or null when the id is unknown.
 */
export async function finishSyncJob(
  store: SyncJobStore,
  jobId: string,
  result: Omit<SyncResult, "jobId" | "provider" | "direction">
): Promise<SyncJob | null> {
  const failed = result.failed > 0 || result.errors.length > 0;
  const row = await store.update(jobId, {
    status: failed ? "failed" : "completed",
    processed: result.processed,
    created_count: result.created,
    updated_count: result.updated,
    skipped_count: result.skipped,
    failed_count: result.failed,
    errors: result.errors,
    finished_at: new Date().toISOString(),
  });
  return row ? rowToJob(row) : null;
}

export async function listSyncJobs(
  store: SyncJobStore,
  workspaceId: string,
  provider?: string
): Promise<SyncJob[]> {
  const rows = await store.listByWorkspace(workspaceId, provider);
  return rows.map(rowToJob);
}

/**
 * Appends one error to a job (and bumps its failed count by one).
 * Best-effort: a store failure here must never mask the original
 * error, so it resolves null instead of throwing.
 */
export async function recordSyncError(
  store: SyncJobStore,
  jobId: string,
  message: string
): Promise<SyncJob | null> {
  try {
    const existing = await store.find(jobId);
    if (!existing) return null;
    const errors = Array.isArray(existing.errors)
      ? [...(existing.errors as string[]), message]
      : [message];
    const row = await store.update(jobId, {
      status: "failed",
      failed_count: Number(existing.failed_count ?? 0) + 1,
      errors,
    });
    return row ? rowToJob(row) : null;
  } catch {
    return null;
  }
}

// ── Lead dedupe ─────────────────────────────────────────────────────────────

/**
 * Deduplicates leads by email, reusing the existing normalisation
 * from `src/lib/data/duplicates` (trim + lowercase) — the same rule
 * the CRM's duplicate detection uses, so an import and the CRM
 * agree on what "the same email" means.
 *
 * First occurrence wins; later rows with the same normalised email
 * land in `duplicates`. Rows with no email are never deduped
 * against each other (an empty email is not an identity).
 */
export function dedupeLeadsByEmail<T extends { email?: string | null }>(
  leads: T[]
): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email) {
      unique.push(lead);
      continue;
    }
    if (seen.has(email)) {
      duplicates.push(lead);
      continue;
    }
    seen.add(email);
    unique.push(lead);
  }
  return { unique, duplicates };
}
