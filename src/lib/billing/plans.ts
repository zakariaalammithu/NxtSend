/**
 * Plan catalog — the single source of truth for SaaS plans.
 *
 * Names, prices and quota claims are taken from the app's existing plan
 * configuration: the dashboard billing page (Starter $49/mo, Growth
 * $149/mo, Agency $299/mo, Free Trial $0) and `planLimits` in
 * src/lib/utils.ts (imported here, never duplicated).
 *
 * NOTE (audit §6, unresolved product decision): the marketing site sells
 * a different, per-seat model ($49/seat, Agency from $499/20 seats,
 * Avatars $387/mo add-on). The two models are NOT silently reconciled
 * here — this catalog follows the in-app billing configuration, and
 * changing either is a product decision for the owner.
 *
 * Stripe price IDs are NOT prices: they are pointers to prices created
 * in the Stripe Dashboard, supplied per-environment via env vars so the
 * amounts above stay display/config data, never a second billing truth.
 */

import { planLimits, type PlanLimit } from "@/lib/utils";
import type { PlanType } from "@/types";

export type BillingInterval = "monthly" | "annual";

export interface PlanDefinition {
  id: PlanType;
  name: string;
  tagline: string;
  /** Display price from the existing billing page. 0 = free trial tier. */
  monthlyPriceUsd: number;
  limits: PlanLimit;
  /** Env var names holding the Stripe Price IDs for this plan. */
  stripePriceEnv: { monthly: string; annual: string };
}

export const PLAN_CATALOG: Record<PlanType, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free Trial",
    tagline: "14-day trial of the platform",
    monthlyPriceUsd: 0,
    limits: planLimits.free,
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_ID_FREE",
      annual: "STRIPE_PRICE_ID_FREE_ANNUAL",
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For solo founders and early SDRs",
    monthlyPriceUsd: 49,
    limits: planLimits.starter,
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_ID_STARTER",
      annual: "STRIPE_PRICE_ID_STARTER_ANNUAL",
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "For growing sales teams",
    monthlyPriceUsd: 149,
    limits: planLimits.growth,
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_ID_GROWTH",
      annual: "STRIPE_PRICE_ID_GROWTH_ANNUAL",
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "For agencies & large SDR pods",
    monthlyPriceUsd: 299,
    limits: planLimits.agency,
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_ID_AGENCY",
      annual: "STRIPE_PRICE_ID_AGENCY_ANNUAL",
    },
  },
};

export const PLAN_IDS = Object.keys(PLAN_CATALOG) as PlanType[];

export function isPlanId(value: unknown): value is PlanType {
  return typeof value === "string" && value in PLAN_CATALOG;
}
