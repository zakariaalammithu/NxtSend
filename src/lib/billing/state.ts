/**
 * Billing (Stripe) state derivation — from actual env presence only.
 *
 *   demo mode                                  -> "demo"
 *   secret key + webhook secret configured     -> "connected"
 *   only one of them configured                -> "configuration_required"
 *   neither                                    -> "not_connected"
 *
 * "connected" means the credentials needed to create checkout sessions
 * AND verify webhooks are present. No charge is ever reported as paid
 * from configuration alone — payment state arrives only via verified
 * webhook events (see ./webhook.ts).
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { PLAN_CATALOG, type BillingInterval } from "./plans";
import type { PlanType } from "@/types";

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

function envFromProcess(): BillingEnv {
  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };
}

export function getBillingState(
  env: BillingEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): ProviderState {
  if (mode === "demo") return "demo";
  const hasKey = isConfiguredValue(env.STRIPE_SECRET_KEY);
  const hasWebhook = isConfiguredValue(env.STRIPE_WEBHOOK_SECRET);
  if (hasKey && hasWebhook) return "connected";
  if (hasKey || hasWebhook) return "configuration_required";
  return "not_connected";
}

/**
 * Resolves the Stripe Price ID configured for a plan + interval.
 * Returns null when unset/placeholder — callers must surface
 * "configuration_required", never invent a price.
 */
export function getStripePriceId(
  plan: PlanType,
  interval: BillingInterval = "monthly",
  env: Record<string, string | undefined> = process.env
): string | null {
  const varName = PLAN_CATALOG[plan].stripePriceEnv[interval];
  const value = env[varName];
  return isConfiguredValue(value) ? (value as string) : null;
}

/** Reverse lookup used by the webhook handler: price ID -> plan. */
export function planForStripePriceId(
  priceId: string,
  env: Record<string, string | undefined> = process.env
): PlanType | null {
  for (const plan of Object.keys(PLAN_CATALOG) as PlanType[]) {
    for (const interval of ["monthly", "annual"] as BillingInterval[]) {
      if (getStripePriceId(plan, interval, env) === priceId) return plan;
    }
  }
  return null;
}
