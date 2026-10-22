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
export { handleStripeWebhook, applyStripeEvent, STRIPE_HANDLED_EVENT_TYPES } from "./webhook";
export type { BillingStore, SubscriptionUpsert, StripeWebhookDeps } from "./webhook";
export {
  resolveEntitlement,
  shouldBlockNewCheckout,
  resolveWorkspaceEntitlement,
} from "./entitlement";
export type {
  EntitlementBasis,
  EntitlementResolution,
  SubscriptionRowLike,
} from "./entitlement";
export { checkoutReturnNotice, billingUrlWithoutCheckoutParam } from "./checkout-return";
export type { CheckoutReturnNotice } from "./checkout-return";
export { mapBillingEventToTransaction } from "./transactions";
export type { BillingTransaction, BillingEventRowLike } from "./transactions";
export { listWorkspaceInvoices, mapStripeInvoice } from "./invoices";
export type { BillingInvoiceSummary, InvoiceLister } from "./invoices";
