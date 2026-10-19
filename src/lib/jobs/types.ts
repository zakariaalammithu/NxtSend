/**
 * Background jobs — types.
 *
 * Jobs live in the `jobs` table (migration 004) and are drained by
 * POST /api/jobs/run (Vercel Cron). Every execution writes a `job_runs`
 * row. Idempotency: `idempotency_key` is unique at enqueue time, and
 * the runner additionally skips any job whose key already completed —
 * a repeated cron tick can never double-execute a logical job.
 */

export const JOB_TYPES = ["follow_up_due", "webhook_retry", "usage_rollup"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface JobRecord {
  id: string;
  workspace_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface JobRunRecord {
  id: string;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "skipped";
  message: string;
}

export interface JobStore {
  listDueJobs(nowIso: string, limit: number): Promise<JobRecord[]>;
  /** True when a DIFFERENT job with this key already completed. */
  hasCompletedWithKey(idempotencyKey: string, exceptJobId: string): Promise<boolean>;
  updateJob(id: string, patch: Partial<JobRecord>): Promise<void>;
  createRun(jobId: string): Promise<JobRunRecord>;
  finishRun(runId: string, status: JobRunRecord["status"], message: string): Promise<void>;
}

export interface JobOutcome {
  status: "completed" | "failed" | "skipped";
  message: string;
}

export type JobHandler = (
  job: JobRecord,
  ctx: JobsContext
) => Promise<JobOutcome>;

/**
 * Capabilities the handlers need, abstracted so the runner is fully
 * testable against an in-memory implementation (no DB, no network).
 */
export interface JobsContext {
  listWorkspaces(): Promise<string[]>;
  getWorkspacePlan(workspaceId: string): Promise<string>;
  /** Current counts; metric keys align with planLimits where sensible. */
  countWorkspaceMetric(
    workspaceId: string,
    metric: "leads" | "campaigns" | "emailsPerMonth",
    periodStartIso: string
  ): Promise<number>;
  upsertUsageRecord(
    workspaceId: string,
    metric: string,
    periodStart: string,
    quantity: number
  ): Promise<void>;
  listDueWebhookRetries(nowIso: string): Promise<
    Array<{
      id: string;
      workspace_id: string;
      status: string;
      attempts: number;
      max_attempts: number;
    }>
  >;
  retryWebhookDelivery(deliveryId: string): Promise<
    { status: string } | { status: "no_config" }
  >;
  /**
   * Sequence-executor capability for the follow_up_due handler
   * (Round-2 Stage F). Optional: contexts that cannot execute
   * sequences (the Demo Mode server context — demo data lives in the
   * browser store, unreachable from a worker) omit it or return null,
   * and the handler records an honest "skipped" outcome.
   */
  getSequenceExecutor?: () => {
    store: import("@/lib/executor/types").ExecutorStore;
    adapter: import("@/lib/email/types").EmailProviderAdapter;
  } | null;
}
