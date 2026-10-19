/**
 * Background jobs module entry point.
 *
 * Scheduler: Vercel Cron -> GET/POST /api/jobs/run (CRON_SECRET-gated).
 * There is deliberately no other always-on worker: on the current
 * deployment (Vercel + Supabase) a cron-invoked route is the only
 * zero-new-infrastructure option (see SETUP.md for plan limits).
 */

export { JOB_TYPES } from "./types";
export type {
  JobType,
  JobRecord,
  JobRunRecord,
  JobStore,
  JobHandler,
  JobOutcome,
  JobsContext,
} from "./types";
export { runDueJobs } from "./runner";
export type { RunSummary } from "./runner";
export { createJobHandlers, monthPeriodStart } from "./handlers";
export { enqueueFollowUpScan, followUpScanKey } from "./producer";
export { createSupabaseJobStore, InMemoryJobStore } from "./store";
export { createSupabaseJobsContext } from "./context";
