/**
 * Workspace usage repository — per-metric used vs plan limit for the
 * signed-in user's OWN workspace (the user-facing counterpart of the
 * admin Usage & Credits overview).
 *
 * Metrics are exactly the set the `usage_rollup` job computes
 * (src/lib/jobs/handlers.ts): leads, campaigns, emailsPerMonth. There
 * is deliberately NO "credits" concept here — plan limits are quotas,
 * and used values are measured counts, never estimates.
 *
 * Backends:
 * - Supabase: reads `usage_records` (written server-side by the rollup
 *   job; members may read their own workspace's rows per migration 004
 *   RLS) for the latest recorded period. When the rollup has not
 *   recorded a period yet, counts are computed live with the rollup's
 *   own definitions and `source` says "computed" so the UI can label
 *   it honestly.
 * - Demo: counts computed live from the demo stores with the same
 *   definitions (leads in the workspace, non-archived campaigns,
 *   outbound email messages recorded this month). Plan = the demo
 *   dataset's plan for the demo workspace ("growth" — the demo
 *   subscription record sub_003 for Alex Vance's workspace).
 *
 * Plan resolution is status-aware and shared: the entitlement
 * resolver (src/lib/billing/entitlement.ts) decides which plan's
 * quotas apply from the subscription's plan + status +
 * current_period_end — a cancelled or lapsed subscription resolves
 * to Free, a past_due one keeps its paid plan only until the
 * paid-through date. The same resolver backs the jobs context and
 * the sequence executor, so the rule cannot drift between surfaces.
 */

import { createClient } from "@/lib/supabase/client";
import type { PlanType } from "@/types";
import { checkLimit, type LimitCheck, type UsageMetric } from "@/lib/billing/limits";
import {
  resolveWorkspaceEntitlement,
  type EntitlementBasis,
  type EntitlementResolution,
} from "@/lib/billing/entitlement";
import { getDataMode, type DataMode } from "./mode";
import { createLeadsRepository } from "./leads";
import { createCampaignsRepository } from "./campaigns";
import { createInboxRepository } from "./inbox";

/** The metrics the usage rollup computes — the only ones with a source. */
export const USAGE_METRICS: UsageMetric[] = ["leads", "campaigns", "emailsPerMonth"];

export type UsageSource = "usage_records" | "computed";

export interface WorkspaceUsage {
  workspace_id: string;
  /** The EFFECTIVE plan (entitlement-resolved), whose quotas are checked below. */
  plan: PlanType;
  /** Stored Stripe subscription status, when a subscription row exists. */
  subscription_status: string | null;
  /** Why `plan` applies — UIs use this to label past-due/downgraded states honestly. */
  entitlement_basis: EntitlementBasis | null;
  /** Stored paid-through date (ISO), when a subscription row provides one. */
  current_period_end: string | null;
  /** First day of the usage period, "YYYY-MM-DD". */
  period_start: string;
  /** Where the numbers came from — UIs must label "computed" as such. */
  source: UsageSource;
  metrics: Partial<Record<UsageMetric, number>>;
  checks: LimitCheck[];
}

export interface UsageRepository {
  readonly mode: DataMode;
  getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage>;
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** "YYYY-MM-01" for the month containing `date` (UTC). */
export function currentPeriodStart(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Builds the used-vs-limit checks for exactly the metrics that have data. */
export function buildUsageChecks(
  plan: PlanType,
  metrics: Partial<Record<UsageMetric, number>>
): LimitCheck[] {
  return USAGE_METRICS.filter(
    (m) => typeof metrics[m] === "number"
  ).map((m) => checkLimit(plan, m, metrics[m] as number));
}

export function buildWorkspaceUsage(input: {
  workspace_id: string;
  plan: PlanType;
  period_start: string;
  source: UsageSource;
  metrics: Partial<Record<UsageMetric, number>>;
  entitlement?: EntitlementResolution | null;
}): WorkspaceUsage {
  return {
    workspace_id: input.workspace_id,
    plan: input.plan,
    subscription_status: input.entitlement?.status ?? null,
    entitlement_basis: input.entitlement?.basis ?? null,
    current_period_end: input.entitlement?.currentPeriodEnd ?? null,
    period_start: input.period_start,
    source: input.source,
    metrics: input.metrics,
    checks: buildUsageChecks(input.plan, input.metrics),
  };
}

// ── Demo backend ────────────────────────────────────────────────────────────

/** The demo dataset's plan for the demo workspace (demo subscription sub_003). */
export const DEMO_WORKSPACE_PLAN: PlanType = "growth";

class DemoUsageRepository implements UsageRepository {
  readonly mode: DataMode = "demo";

  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const periodStart = currentPeriodStart();
    const periodStartIso = `${periodStart}T00:00:00.000Z`;

    const leads = await createLeadsRepository("demo").listLeads(workspaceId);
    const campaigns = await createCampaignsRepository("demo").listCampaigns(workspaceId);

    // Outbound email messages recorded this month — the rollup's
    // definition, applied to the demo message store (simulated sends
    // included: in Demo Mode every send is simulated and labelled).
    let emails = 0;
    const inbox = createInboxRepository("demo");
    const { conversations } = await inbox.listConversations(workspaceId, { limit: 500 });
    for (const conv of conversations) {
      const thread = await inbox.getThread(workspaceId, conv.id);
      if (!thread) continue;
      for (const msg of thread.messages) {
        if (
          msg.direction === "outbound" &&
          msg.channel === "email" &&
          msg.sent_at >= periodStartIso
        ) {
          emails++;
        }
      }
    }

    return buildWorkspaceUsage({
      workspace_id: workspaceId,
      plan: DEMO_WORKSPACE_PLAN,
      period_start: periodStart,
      source: "computed",
      metrics: {
        leads: leads.length,
        campaigns: campaigns.filter((c) => c.status !== "archived").length,
        emailsPerMonth: emails,
      },
    });
  }
}

// ── Supabase backend ────────────────────────────────────────────────────────

class SupabaseUsageRepository implements UsageRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    return supabase;
  }

  private async resolveEntitlement(
    workspaceId: string
  ): Promise<EntitlementResolution> {
    return resolveWorkspaceEntitlement(this.client(), workspaceId);
  }

  /** Live counts with the usage_rollup job's exact definitions. */
  private async computeLiveCounts(
    workspaceId: string,
    periodStart: string
  ): Promise<Partial<Record<UsageMetric, number>>> {
    const supabase = this.client();
    const periodStartIso = `${periodStart}T00:00:00.000Z`;
    const [leads, campaigns, emails] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .neq("status", "archived"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("channel", "email")
        .eq("direction", "outbound")
        .eq("is_demo", false)
        .gte("sent_at", periodStartIso),
    ]);
    return {
      leads: leads.count ?? 0,
      campaigns: campaigns.count ?? 0,
      emailsPerMonth: emails.count ?? 0,
    };
  }

  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const supabase = this.client();
    const entitlement = await this.resolveEntitlement(workspaceId);
    const plan = entitlement.plan;

    const { data, error } = await supabase
      .from("usage_records")
      .select("metric, period_start, quantity")
      .eq("workspace_id", workspaceId)
      .order("period_start", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Failed to load usage records: ${error.message}`);

    const rows = (data ?? []) as Array<{
      metric: string;
      period_start: string;
      quantity: number;
    }>;

    if (rows.length > 0) {
      const latestPeriod = String(rows[0].period_start).slice(0, 10);
      const metrics: Partial<Record<UsageMetric, number>> = {};
      for (const row of rows) {
        if (String(row.period_start).slice(0, 10) !== latestPeriod) continue;
        if ((USAGE_METRICS as string[]).includes(row.metric)) {
          metrics[row.metric as UsageMetric] = Number(row.quantity ?? 0);
        }
      }
      return buildWorkspaceUsage({
        workspace_id: workspaceId,
        plan,
        period_start: latestPeriod,
        source: "usage_records",
        metrics,
        entitlement,
      });
    }

    // No rollup period recorded yet — compute live, labelled as such.
    const periodStart = currentPeriodStart();
    const metrics = await this.computeLiveCounts(workspaceId, periodStart);
    return buildWorkspaceUsage({
      workspace_id: workspaceId,
      plan,
      period_start: periodStart,
      source: "computed",
      metrics,
      entitlement,
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createUsageRepository(mode: DataMode = getDataMode()): UsageRepository {
  return mode === "supabase" ? new SupabaseUsageRepository() : new DemoUsageRepository();
}
