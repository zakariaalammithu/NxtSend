/**
 * Demo Mode sequence runner — the in-app trigger for the executor.
 *
 * Why this exists: in Demo Mode the dataset lives in the browser demo
 * store (localStorage); a server-side cron worker cannot see it. So
 * the campaign page offers "Run due steps now" which executes the
 * very same core (./core) against DemoExecutorStore. In live mode
 * this function is never used — the `follow_up_due` cron job runs the
 * core server-side against Supabase.
 *
 * The adapter below is a behaviour-identical stand-in for the Resend
 * adapter's DEMO branch: ResendEmailAdapter.sendEmail() checks its
 * state first, and in demo state returns exactly this simulated
 * result without calling anything (see src/lib/email/resend.ts). The
 * real adapter cannot be imported into the browser bundle (its import
 * chain reaches next/headers via the service-role client), so the
 * demo runner uses the stand-in; the executor core, stores, records
 * and labelling are the real ones.
 */

import { getCampaignsRepository, getLeadsRepository, getInboxRepository } from "@/lib/data";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import type { EmailProviderAdapter } from "@/lib/email/types";
import { executeDueSteps } from "./core";
import { DemoExecutorStore } from "./demo-store";
import type { ExecutorRunSummary } from "./types";

export const DEMO_ADAPTER_MESSAGE =
  "Demo Mode: no email was sent. Connect Supabase and set RESEND_API_KEY + EMAIL_FROM to send for real.";

export function createDemoAdapter(): EmailProviderAdapter {
  return {
    provider: "resend",
    getState: () => "demo",
    async sendEmail() {
      return {
        status: "simulated",
        provider: "resend",
        providerMessageId: null,
        message: DEMO_ADAPTER_MESSAGE,
      };
    },
  };
}

export async function runDemoSequenceScan(
  workspaceId: string = DEMO_WORKSPACE_ID,
  now?: Date
): Promise<ExecutorRunSummary> {
  const store = new DemoExecutorStore({
    campaigns: getCampaignsRepository(),
    leads: getLeadsRepository(),
    inbox: getInboxRepository(),
  });
  return executeDueSteps(
    { store, adapter: createDemoAdapter(), now },
    { workspaceId }
  );
}
