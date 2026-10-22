/**
 * Subscription entitlement resolution — the ONE place that decides
 * which plan a workspace is actually entitled to, given its stored
 * subscription record.
 *
 * Why this exists (P9 audit §B.1): plan resolution used to read
 * `subscriptions.plan` alone, ignoring `status` and
 * `current_period_end`. A workspace that cancelled in the Stripe
 * portal kept its paid plan's quotas forever, because the webhook
 * faithfully stored status "canceled" and nothing ever read it.
 *
 * The rule (explicit, tested — see __tests__/entitlement.test.ts):
 *
 *   - No subscription row, or a row with no plan yet (a Stripe
 *     customer created by an abandoned checkout): the caller's
 *     fallback applies (historically `workspaces.plan`, then "free").
 *     Basis: "stored_plan".
 *   - A stored FREE plan grants the Free plan. Basis: "stored_plan".
 *   - Stored PAID plan + status "active" or "trialing": the paid plan
 *     applies — UNLESS the stored period has already ended, which
 *     means the renewal events never arrived (a lapsed record) and
 *     the workspace resolves to Free. Basis: "active" / "trialing".
 *   - Stored PAID plan + status "past_due": dunning grace. The paid
 *     plan applies until `current_period_end` — the period the
 *     customer already paid for — and falls back to Free afterwards
 *     (or immediately when no paid-through date is known).
 *     Basis: "past_due_grace" while grace lasts.
 *   - Every other state (canceled, unpaid, incomplete,
 *     incomplete_expired, paused, unknown status, or any lapsed
 *     period): Free. Basis: "free_downgrade".
 *
 * This module is pure (the DB helper at the bottom only fetches the
 * row); all enforcement/display call sites share it so the rule can
 * never drift between the dashboard, the jobs worker and the
 * sequence executor again.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanType } from "@/types";
import { isPlanId } from "./plans";

export interface SubscriptionRowLike {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

export type EntitlementBasis =
  /** Paid plan applies: subscription status is active. */
  | "active"
  /** Paid plan applies: subscription status is trialing. */
  | "trialing"
  /** Paid plan applies during dunning grace (past_due, period not yet ended). */
  | "past_due_grace"
  /** No paid subscription entitlement involved: the stored/fallback plan applies. */
  | "stored_plan"
  /** A paid plan was stored but no longer entitles: Free applies. */
  | "free_downgrade";

export interface EntitlementResolution {
  /** The plan whose quotas apply right now. */
  plan: PlanType;
  basis: EntitlementBasis;
  /** The stored Stripe subscription status, when a subscription row exists. */
  status: string | null;
  /** The stored paid-through date (ISO), when known. */
  currentPeriodEnd: string | null;
}

function periodHasEnded(periodEnd: string | null, now: Date): boolean {
  if (!periodEnd) return false;
  const parsed = Date.parse(periodEnd);
  if (!Number.isFinite(parsed)) return false;
  return parsed <= now.getTime();
}

/**
 * Resolves the effective entitlement from a subscription row.
 * `fallbackPlan` is used only when the row carries no plan of its own
 * (no row at all, or a customer-only row) — preserving the historical
 * `workspaces.plan` → "free" fallback chain at the call sites.
 */
export function resolveEntitlement(
  sub: SubscriptionRowLike | null,
  fallbackPlan: PlanType = "free",
  now: Date = new Date()
): EntitlementResolution {
  const status = sub?.status ?? null;
  const currentPeriodEnd = sub?.current_period_end ?? null;

  if (!sub || !sub.plan || !isPlanId(sub.plan)) {
    return { plan: fallbackPlan, basis: "stored_plan", status, currentPeriodEnd };
  }

  const storedPlan = sub.plan as PlanType;
  if (storedPlan === "free") {
    return { plan: "free", basis: "stored_plan", status, currentPeriodEnd };
  }

  const ended = periodHasEnded(currentPeriodEnd, now);

  if (status === "active" && !ended) {
    return { plan: storedPlan, basis: "active", status, currentPeriodEnd };
  }
  if (status === "trialing" && !ended) {
    return { plan: storedPlan, basis: "trialing", status, currentPeriodEnd };
  }
  if (status === "past_due" && currentPeriodEnd && !ended) {
    return { plan: storedPlan, basis: "past_due_grace", status, currentPeriodEnd };
  }
  return { plan: "free", basis: "free_downgrade", status, currentPeriodEnd };
}

/**
 * Checkout guard (P9 B2): a workspace whose stored subscription still
 * entitles it to a paid plan must NOT start a second Stripe Checkout —
 * that would create a second, orphaned subscription billing alongside
 * the first. Plan changes for such workspaces go through the Stripe
 * Customer Portal. A downgraded/lapsed record does not block: the
 * customer may subscribe again.
 */
export function shouldBlockNewCheckout(
  sub: SubscriptionRowLike | null,
  now: Date = new Date()
): boolean {
  const { basis } = resolveEntitlement(sub, "free", now);
  return basis === "active" || basis === "trialing" || basis === "past_due_grace";
}

/**
 * DB-backed resolution shared by every server call site. Fetches the
 * subscription row (plan/status/period end) and, only when the row
 * carries no plan, the historical `workspaces.plan` fallback.
 * Works with any Supabase client flavour (browser, server, service
 * role) — the caller supplies the client appropriate to its context.
 */
export async function resolveWorkspaceEntitlement(
  client: SupabaseClient,
  workspaceId: string,
  now: Date = new Date()
): Promise<EntitlementResolution> {
  const { data: sub } = await client
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const row = (sub as SubscriptionRowLike | null) ?? null;
  let fallbackPlan: PlanType = "free";
  if (!row || !row.plan) {
    const { data: ws } = await client
      .from("workspaces")
      .select("plan")
      .eq("id", workspaceId)
      .maybeSingle();
    const wsPlan = (ws as { plan?: string | null } | null)?.plan;
    if (wsPlan && isPlanId(wsPlan)) fallbackPlan = wsPlan;
  }
  return resolveEntitlement(row, fallbackPlan, now);
}
