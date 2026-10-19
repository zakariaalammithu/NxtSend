/**
 * Sequence executor module entry point.
 *
 * Live mode: the `follow_up_due` background job (src/lib/jobs) runs
 * `executeDueSteps` against SupabaseExecutorStore + the real email
 * adapter. Demo Mode: `runDemoSequenceScan` (./demo-runner) runs the
 * same core against the browser demo store. One engine, two stores —
 * the outcomes recorded are identical in shape, and demo records are
 * always flagged simulated.
 */

export * from "./types";
export {
  executeDueSteps,
  stepChannel,
  stepDueAt,
  isStepDue,
  evaluateStopRules,
  monthPeriodStartIso,
  leadDisplayName,
  type ExecuteDueStepsDeps,
  type StopDecision,
} from "./core";
export { SupabaseExecutorStore } from "./supabase-store";
export { DemoExecutorStore } from "./demo-store";
