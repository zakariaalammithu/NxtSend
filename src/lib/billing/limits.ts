/**
 * Plan-limit / usage enforcement helpers.
 *
 * Pure functions over `planLimits` (src/lib/utils.ts, via PLAN_CATALOG).
 * Consumers: the usage_rollup background job (flags workspaces over
 * quota in its run log) and any future server-side create/import path
 * that needs a quota decision. Enforcement is a check, not a guess:
 * `used` must come from a real count (DB row count or usage_records).
 */

import type { PlanLimit } from "@/lib/utils";
import { PLAN_CATALOG } from "./plans";
import type { PlanType } from "@/types";

export type UsageMetric = keyof PlanLimit;

export interface LimitCheck {
  plan: PlanType;
  metric: UsageMetric;
  limit: number;
  used: number;
  remaining: number;
  percentUsed: number;
  allowed: boolean;
}

export function checkLimit(
  plan: PlanType,
  metric: UsageMetric,
  used: number
): LimitCheck {
  const limit = PLAN_CATALOG[plan].limits[metric];
  const safeUsed = Math.max(0, Math.floor(used));
  return {
    plan,
    metric,
    limit,
    used: safeUsed,
    remaining: Math.max(0, limit - safeUsed),
    percentUsed: limit > 0 ? Math.min(100, Math.round((safeUsed / limit) * 100)) : 100,
    allowed: safeUsed < limit,
  };
}

/** Would adding `additional` units of `metric` stay within the plan? */
export function canAdd(
  plan: PlanType,
  metric: UsageMetric,
  used: number,
  additional: number
): boolean {
  const limit = PLAN_CATALOG[plan].limits[metric];
  return Math.max(0, Math.floor(used)) + Math.max(0, Math.floor(additional)) <= limit;
}

export function summarizeUsage(
  plan: PlanType,
  counts: Partial<Record<UsageMetric, number>>
): LimitCheck[] {
  return (Object.keys(PLAN_CATALOG[plan].limits) as UsageMetric[]).map(
    (metric) => checkLimit(plan, metric, counts[metric] ?? 0)
  );
}

/** Metrics at or over quota, for alerting/logging. */
export function overLimitMetrics(checks: LimitCheck[]): LimitCheck[] {
  return checks.filter((c) => !c.allowed);
}
