/**
 * Job runner — claims due jobs, executes them once, logs every run.
 *
 * Claiming rules:
 *   - due = status pending with run_after <= now, or status failed with
 *     attempts remaining and run_after <= now (backoff).
 *   - a job whose idempotency_key already completed (another row) is
 *     marked "skipped" without executing — idempotent re-runs are safe.
 *   - handler failure requeues with a 15-minute backoff until
 *     max_attempts, then the job stays "failed" with the last error.
 */

import type { JobStore, JobsContext, JobHandler, JobRecord } from "./types";

export interface RunSummary {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  results: Array<{
    jobId: string;
    type: string;
    status: "completed" | "failed" | "skipped";
    message: string;
  }>;
}

const FAILURE_BACKOFF_MS = 15 * 60_000;

export async function runDueJobs(deps: {
  store: JobStore;
  ctx: JobsContext;
  handlers: Record<string, JobHandler>;
  now?: Date;
  limit?: number;
}): Promise<RunSummary> {
  const now = deps.now ?? new Date();
  const due = await deps.store.listDueJobs(now.toISOString(), deps.limit ?? 25);
  const summary: RunSummary = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const job of due) {
    summary.processed++;
    const outcome = await runOneJob(deps.store, deps.handlers, deps.ctx, job, now);
    summary.results.push({
      jobId: job.id,
      type: job.type,
      status: outcome.status,
      message: outcome.message,
    });
    if (outcome.status === "completed") summary.completed++;
    else if (outcome.status === "failed") summary.failed++;
    else summary.skipped++;
  }

  return summary;
}

async function runOneJob(
  store: JobStore,
  handlers: Record<string, JobHandler>,
  ctx: JobsContext,
  job: JobRecord,
  now: Date
): Promise<{ status: "completed" | "failed" | "skipped"; message: string }> {
  // Idempotency: the same logical job already completed under this key.
  if (await store.hasCompletedWithKey(job.idempotency_key, job.id)) {
    await store.updateJob(job.id, {
      status: "skipped",
      last_error: null,
      completed_at: now.toISOString(),
    });
    const run = await store.createRun(job.id);
    await store.finishRun(
      run.id,
      "skipped",
      `Idempotent skip: another job with key "${job.idempotency_key}" already completed.`
    );
    return {
      status: "skipped",
      message: "Duplicate of an already-completed job (idempotency key).",
    };
  }

  const handler = handlers[job.type];
  const run = await store.createRun(job.id);
  await store.updateJob(job.id, {
    status: "running",
    attempts: job.attempts + 1,
  });

  if (!handler) {
    const message = `Unknown job type "${job.type}" — no handler registered.`;
    await store.finishRun(run.id, "skipped", message);
    await store.updateJob(job.id, {
      status: "skipped",
      last_error: message,
      completed_at: now.toISOString(),
    });
    return { status: "skipped", message };
  }

  try {
    const outcome = await handler(job, ctx);
    await store.finishRun(run.id, outcome.status, outcome.message);
    if (outcome.status === "completed") {
      await store.updateJob(job.id, {
        status: "completed",
        last_error: null,
        completed_at: now.toISOString(),
      });
    } else if (outcome.status === "skipped") {
      await store.updateJob(job.id, {
        status: "skipped",
        last_error: outcome.message,
        completed_at: now.toISOString(),
      });
    } else {
      await applyFailure(store, job, outcome.message, now);
    }
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler threw";
    await store.finishRun(run.id, "failed", message);
    await applyFailure(store, job, message, now);
    return { status: "failed", message };
  }
}

async function applyFailure(
  store: JobStore,
  job: JobRecord,
  message: string,
  now: Date
): Promise<void> {
  const attempts = job.attempts + 1;
  const exhausted = attempts >= job.max_attempts;
  await store.updateJob(job.id, {
    status: "failed",
    last_error: message,
    completed_at: exhausted ? now.toISOString() : null,
    run_after: exhausted
      ? job.run_after
      : new Date(now.getTime() + FAILURE_BACKOFF_MS).toISOString(),
  });
}
