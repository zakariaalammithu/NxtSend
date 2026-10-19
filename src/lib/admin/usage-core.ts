/**
 * Admin Usage & Credits + User Growth — pure core.
 *
 * Usage rows are built from REAL substrate: `usage_records` (written by
 * the usage_rollup job) joined with workspace plan data in live mode,
 * or the labelled demo seed in Demo Mode. Over-limit flags come from
 * the billing module's `checkLimit` — the same single source of truth
 * (PLAN_CATALOG / planLimits) the Credit Rules page displays. Nothing
 * here invents numbers: callers pass measured quantities only.
 */

import { checkLimit, type LimitCheck, type UsageMetric } from "@/lib/billing/limits";
import type { PlanType } from "@/types";

export interface WorkspaceUsageRow {
  workspace_id: string;
  workspace_name: string;
  plan: PlanType;
  period_start: string | null;
  metrics: Partial<Record<UsageMetric, number>>;
  checks: LimitCheck[];
  over_limit: UsageMetric[];
}

export function buildUsageRow(input: {
  workspace_id: string;
  workspace_name: string;
  plan: PlanType;
  period_start: string | null;
  metrics: Partial<Record<UsageMetric, number>>;
}): WorkspaceUsageRow {
  const metrics = input.metrics;
  const metricKeys = Object.keys(metrics) as UsageMetric[];
  const checks = metricKeys
    .filter((m) => typeof metrics[m] === "number")
    .map((m) => checkLimit(input.plan, m, metrics[m] as number));
  return {
    workspace_id: input.workspace_id,
    workspace_name: input.workspace_name,
    plan: input.plan,
    period_start: input.period_start,
    metrics,
    checks,
    over_limit: checks.filter((c) => !c.allowed).map((c) => c.metric),
  };
}

// ── User growth ─────────────────────────────────────────────────────────────

export interface GrowthBucket {
  /** "YYYY-MM" */
  month: string;
  signups: number;
  cumulative: number;
}

/**
 * Groups signup timestamps by calendar month (UTC), ascending, with a
 * running total. Pure — the page feeds it created_at values from the
 * admin users substrate (profiles in live mode, the labelled demo
 * dataset in Demo Mode).
 */
export function groupSignupsByMonth(timestamps: string[]): GrowthBucket[] {
  const byMonth = new Map<string, number>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const months = Array.from(byMonth.keys()).sort();
  let cumulative = 0;
  return months.map((month) => {
    const signups = byMonth.get(month) as number;
    cumulative += signups;
    return { month, signups, cumulative };
  });
}
