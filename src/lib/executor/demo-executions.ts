/**
 * Demo Mode step executions — the localStorage collection, its seed
 * fixtures, and the demo warm-up usage counter.
 *
 * This leaf exists to break an import cycle: the demo executor store
 * (./demo-store) owns execution persistence, but the accounts
 * repository (src/lib/data/accounts) also needs to COUNT today's
 * demo executions for the warm-up panel — and the demo executor store
 * already imports the accounts repository. Both therefore build on
 * this module, which depends only on the demo storage helpers.
 *
 * DEMO COUNTING RULE (deliberate, demo-only): in Demo Mode no real
 * send ever happens — LinkedIn steps are recorded "skipped" (no
 * authorized provider) and email steps "simulated" — so a counter
 * over status='sent' would read zero forever and the warm-up gate
 * could never be exercised in the demo. The demo counter therefore
 * counts today's DISPATCH ATTEMPTS: this account's LinkedIn execution
 * rows from today with status sent / simulated / skipped. The live
 * (Supabase) counter counts status='sent' ONLY — real sends. The two
 * rules are documented at both implementations; do not "unify" them.
 */

import {
  loadDemoCollection,
  saveDemoCollection,
} from "@/lib/data/demo-store";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import {
  emptyWarmupUsage,
  stepTypeToWarmupAction,
  type WarmupUsageCounts,
} from "@/lib/linkedin/warmup";
import type { StepExecutionRecord } from "./types";

export const DEMO_EXECUTIONS_KEY = "nxtsend_demo_step_executions_v1";

/**
 * The demo LinkedIn account id (src/lib/data/accounts
 * DEMO_LINKEDIN_ACCOUNT_ID). Duplicated as a literal because that
 * module imports this one — importing it back would close the cycle.
 */
const DEMO_LINKEDIN_ACCOUNT_ID_VALUE = "acc_demo_linkedin";

/**
 * First-run fixtures: three connection-request attempts made TODAY by
 * the seeded demo campaign against the demo LinkedIn account, which
 * is itself seeded mid-program (Day 3 of Conservative — phase 1 cap 5
 * connection requests/day). The panel therefore opens showing 3 of 5
 * used, and a demo executor run defers further connection requests
 * after 2 more. The records mirror exactly what the demo executor
 * writes for a LinkedIn step today: status "skipped" with the honest
 * no-provider detail (never simulated-as-sent).
 */
export function seedDemoExecutions(): StepExecutionRecord[] {
  const now = new Date().toISOString();
  return [1, 2, 3].map((i) => ({
    id: `exec_demo_warmup_${i}`,
    workspace_id: DEMO_WORKSPACE_ID,
    campaign_id: "cmp_demo_001",
    enrollment_id: `enr_demo_warmup_${i}`,
    lead_id: `lead_demo_00${i}`,
    step_order: 0,
    step_type: "connection_request" as const,
    channel: "linkedin" as const,
    status: "skipped" as const,
    detail:
      "LinkedIn step recorded but NOT sent: no authorized LinkedIn provider is configured for this workspace (demo).",
    account_id: DEMO_LINKEDIN_ACCOUNT_ID_VALUE,
    message_id: null,
    provider: null,
    provider_message_id: null,
    idempotency_key: `step:enr_demo_warmup_${i}:0`,
    simulated: true,
    created_at: now,
    updated_at: now,
  }));
}

export function loadDemoExecutions(): StepExecutionRecord[] {
  return loadDemoCollection<StepExecutionRecord>(
    DEMO_EXECUTIONS_KEY,
    seedDemoExecutions
  );
}

export function saveDemoExecutions(items: StepExecutionRecord[]): void {
  saveDemoCollection(DEMO_EXECUTIONS_KEY, items);
}

/** Statuses the DEMO counter treats as a dispatch attempt (see header). */
const DEMO_COUNTED_STATUSES: ReadonlySet<string> = new Set([
  "sent",
  "simulated",
  "skipped",
]);

/**
 * Today's counted LinkedIn usage for one demo account (UTC day from
 * `dayStartIso`), under the DEMO counting rule in the header.
 */
export function countDemoLinkedInActions(
  accountId: string,
  dayStartIso: string
): WarmupUsageCounts {
  const counts = emptyWarmupUsage();
  for (const record of loadDemoExecutions()) {
    if (record.workspace_id !== DEMO_WORKSPACE_ID) continue;
    if (record.account_id !== accountId) continue;
    if (record.channel !== "linkedin") continue;
    if (record.created_at < dayStartIso) continue;
    if (!DEMO_COUNTED_STATUSES.has(record.status)) continue;
    const action = stepTypeToWarmupAction(record.step_type);
    if (action) counts[action] += 1;
  }
  return counts;
}
