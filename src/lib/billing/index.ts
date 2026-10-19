/**
 * Billing module entry point (Stripe, server-side).
 *
 * Everything here is inert until STRIPE_SECRET_KEY +
 * STRIPE_WEBHOOK_SECRET + per-plan STRIPE_PRICE_ID_* are configured;
 * states are derived from env (./state.ts), and plan/status changes are
 * applied only from signature-verified webhook events (./webhook.ts).
 */

export { PLAN_CATALOG, PLAN_IDS, isPlanId } from "./plans";
export type { PlanDefinition, BillingInterval } from "./plans";
export { getBillingState, getStripePriceId, planForStripePriceId } from "./state";
export { checkLimit, canAdd, summarizeUsage, overLimitMetrics } from "./limits";
export type { LimitCheck, UsageMetric } from "./limits";
export { getStripeClient } from "./stripe-client";
export { handleStripeWebhook, applyStripeEvent } from "./webhook";
export type { BillingStore, SubscriptionUpsert, StripeWebhookDeps } from "./webhook";
