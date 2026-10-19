/**
 * Job stores: Supabase (service role) + in-memory (Demo Mode / tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "@/lib/utils";
import type { JobRecord, JobRunRecord, JobStore } from "./types";

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    workspace_id: (row.workspace_id as string | null) ?? null,
    type: String(row.type),
    payload: (row.payload as Record<string, unknown>) ?? {},
    idempotency_key: String(row.idempotency_key),
    status: row.status as JobRecord["status"],
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    run_after: String(row.run_after),
    last_error: (row.last_error as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

export function createSupabaseJobStore(admin: SupabaseClient): JobStore {
  return {
    async listDueJobs(nowIso, limit) {
      const { data, error } = await admin
        .from("jobs")
        .select("*")
        .in("status", ["pending", "failed"])
        .lte("run_after", nowIso)
        .order("run_after", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Failed to list due jobs: ${error.message}`);
      return (data ?? [])
        .map((r) => rowToJob(r as Record<string, unknown>))
        .filter((j) => j.status === "pending" || j.attempts < j.max_attempts);
    },
    async hasCompletedWithKey(key, exceptJobId) {
      const { data } = await admin
        .from("jobs")
        .select("id")
        .eq("idempotency_key", key)
        .eq("status", "completed")
        .neq("id", exceptJobId)
        .limit(1);
      return (data ?? []).length > 0;
    },
    async updateJob(id, patch) {
      const { error } = await admin
        .from("jobs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to update job: ${error.message}`);
    },
    async createRun(jobId) {
      const { data, error } = await admin
        .from("job_runs")
        .insert({ job_id: jobId, status: "running", message: "" })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create job run: ${error?.message ?? "no row"}`);
      }
      const r = data as Record<string, unknown>;
      return {
        id: String(r.id),
        job_id: String(r.job_id),
        started_at: String(r.started_at),
        finished_at: (r.finished_at as string | null) ?? null,
        status: r.status as JobRunRecord["status"],
        message: String(r.message ?? ""),
      };
    },
    async finishRun(runId, status, message) {
      const { error } = await admin
        .from("job_runs")
        .update({ status, message, finished_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw new Error(`Failed to finish job run: ${error.message}`);
    },
  };
}

// ── In-memory store ─────────────────────────────────────────────────────────

export class InMemoryJobStore implements JobStore {
  jobs = new Map<string, JobRecord>();
  runs: JobRunRecord[] = [];

  seed(job: Partial<JobRecord> & { type: string; idempotency_key: string }): JobRecord {
    const ts = new Date().toISOString();
    const record: JobRecord = {
      id: job.id ?? generateId(),
      workspace_id: job.workspace_id ?? null,
      type: job.type,
      payload: job.payload ?? {},
      idempotency_key: job.idempotency_key,
      status: job.status ?? "pending",
      attempts: job.attempts ?? 0,
      max_attempts: job.max_attempts ?? 3,
      run_after: job.run_after ?? ts,
      last_error: job.last_error ?? null,
      created_at: job.created_at ?? ts,
      updated_at: ts,
      completed_at: job.completed_at ?? null,
    };
    this.jobs.set(record.id, record);
    return record;
  }

  async listDueJobs(nowIso: string, limit: number): Promise<JobRecord[]> {
    return Array.from(this.jobs.values())
      .filter(
        (j) =>
          (j.status === "pending" || (j.status === "failed" && j.attempts < j.max_attempts)) &&
          j.run_after <= nowIso
      )
      .sort((a, b) => a.run_after.localeCompare(b.run_after))
      .slice(0, limit);
  }

  async hasCompletedWithKey(key: string, exceptJobId: string): Promise<boolean> {
    return Array.from(this.jobs.values()).some(
      (j) => j.idempotency_key === key && j.status === "completed" && j.id !== exceptJobId
    );
  }

  async updateJob(id: string, patch: Partial<JobRecord>): Promise<void> {
    const existing = this.jobs.get(id);
    if (!existing) return;
    this.jobs.set(id, { ...existing, ...patch, updated_at: new Date().toISOString() });
  }

  async createRun(jobId: string): Promise<JobRunRecord> {
    const run: JobRunRecord = {
      id: generateId(),
      job_id: jobId,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "running",
      message: "",
    };
    this.runs.push(run);
    return run;
  }

  async finishRun(runId: string, status: JobRunRecord["status"], message: string): Promise<void> {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) return;
    run.status = status;
    run.message = message;
    run.finished_at = new Date().toISOString();
  }
}
