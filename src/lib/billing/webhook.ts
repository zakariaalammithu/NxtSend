/**
 * Stripe webhook handling — real signature verification + idempotency.
 *
 * Verification uses the SDK's `stripe.webhooks.constructEvent`, which
 * recomputes the HMAC over the RAW body with STRIPE_WEBHOOK_SECRET and
 * enforces the timestamp tolerance. When the secret is unset the handler
 * rejects (503): unverified payment events are never applied.
 *
 * Idempotency: the event ID is recorded in `billing_events` BEFORE its
 * effects are applied; a redelivery finds the record and returns 200
 * without re-applying. If applying throws, the record is removed again
 * and a 500 is returned so Stripe retries and the event is reprocessed
 * exactly once it can succeed — never double-applied, never swallowed.
 *
 * Failure visibility (P9 B4): because an apply failure deletes the
 * idempotency record (so the retry can reprocess), it would otherwise
 * leave no trace. Every apply failure is therefore ALSO written to
 * the separate `billing_webhook_failures` log (migration 017) —
 * best-effort, never touching the exactly-once flow above — and a
 * later successful processing of the same event marks the failure
 * rows resolved (the history is kept, never deleted).
 *
 * Refunds and disputes (P9 B3) are recorded through the same
 * pipeline: the verified event lands in `billing_events`, and the
 * admin transactions view derives the refunded/disputed state from
 * it. They deliberately do NOT mutate the subscription: a partial
 * refund is not a cancellation, and a dispute is an allegation, not
 * an outcome. `charge.dispute.closed` records the outcome.
 *
 * Plan changes happen ONLY here (from verified events), never from the
 * checkout route: creating a checkout session is not a payment.
 */

import type Stripe from "stripe";
import { isConfiguredValue } from "@/lib/env";
import type { PlanType } from "@/types";

export interface SubscriptionUpsert {
  workspaceId: string;
  plan: PlanType;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: string | null;
}

export interface BillingStore {
  hasEvent(eventId: string): Promise<boolean>;
  recordEvent(eventId: string, eventType: string, payload: unknown): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  getWorkspaceIdByCustomerId(customerId: string): Promise<string | null>;
  upsertSubscription(row: SubscriptionUpsert): Promise<void>;
  setSubscriptionStatusByCustomer(customerId: string, status: string): Promise<void>;
  /** Append-only failure log (migration 017) — separate from the idempotency store. */
  recordWebhookFailure(eventId: string, eventType: string, errorSummary: string): Promise<void>;
  /** Marks every still-open failure row for the event resolved (history is kept). */
  markWebhookFailuresResolved(eventId: string): Promise<void>;
}

/**
 * Every event type this handler acts on (applies an effect or records
 * with a dedicated action). These are the events to register on the
 * Stripe webhook endpoint; anything else Stripe sends is still
 * recorded in `billing_events` with action "recorded_no_action".
 */
export const STRIPE_HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;

export interface StripeWebhookDeps {
  stripe: Stripe | null;
  webhookSecret: string | undefined;
  store: BillingStore | null;
  priceToPlan: (priceId: string) => PlanType | null;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
}

export interface WebhookHandleResult {
  status: number;
  body: Record<string, unknown>;
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const anySub = sub as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const raw =
    anySub.current_period_end ?? anySub.items?.data?.[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

function firstPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

async function applySubscription(
  store: BillingStore,
  workspaceId: string,
  sub: Stripe.Subscription,
  priceToPlan: (priceId: string) => PlanType | null
): Promise<string> {
  const priceId = firstPriceId(sub);
  const plan = priceId ? priceToPlan(priceId) : null;
  if (!plan) {
    return "ignored_unknown_price";
  }
  await store.upsertSubscription({
    workspaceId,
    plan,
    status: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : null,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEndIso(sub),
  });
  return "subscription_upserted";
}

export async function applyStripeEvent(
  event: Stripe.Event,
  deps: StripeWebhookDeps
): Promise<string> {
  const store = deps.store as BillingStore;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId =
        session.client_reference_id ??
        (session.metadata?.workspace_id as string | undefined) ??
        null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (!workspaceId || !subscriptionId) return "ignored_missing_refs";
      const sub = await deps.retrieveSubscription(subscriptionId);
      return applySubscription(store, workspaceId, sub, deps.priceToPlan);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      if (!customerId) return "ignored_no_customer";
      const workspaceId = await store.getWorkspaceIdByCustomerId(customerId);
      if (!workspaceId) return "ignored_unknown_customer";
      return applySubscription(store, workspaceId, sub, deps.priceToPlan);
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      if (!customerId) return "ignored_no_customer";
      await store.setSubscriptionStatusByCustomer(customerId, "canceled");
      return "subscription_canceled";
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return "ignored_no_customer";
      await store.setSubscriptionStatusByCustomer(customerId, "past_due");
      return "subscription_past_due";
    }
    case "charge.refunded":
      // Recorded in billing_events by the pipeline; the admin
      // transactions view derives the refunded amount/state from the
      // stored payload. No subscription mutation: a (partial) refund
      // is not a cancellation.
      return "refund_recorded";
    case "charge.dispute.created":
      // Recorded for admin visibility only — a dispute is an
      // allegation; the outcome arrives as charge.dispute.closed.
      return "dispute_recorded";
    case "charge.dispute.closed":
      return "dispute_closed_recorded";
    default:
      return "recorded_no_action";
  }
}

function errorSummary(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return (message || "Unknown error").slice(0, 500);
}

export async function handleStripeWebhook(args: {
  rawBody: string;
  signature: string | null;
  deps: StripeWebhookDeps;
}): Promise<WebhookHandleResult> {
  const { rawBody, signature, deps } = args;

  if (!deps.stripe || !isConfiguredValue(deps.webhookSecret)) {
    return {
      status: 503,
      body: {
        error:
          "Stripe billing is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing). Webhook events are rejected rather than accepted unverified.",
        state: "not_configured",
      },
    };
  }
  if (!signature) {
    return { status: 400, body: { error: "Missing stripe-signature header" } };
  }

  let event: Stripe.Event;
  try {
    event = deps.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      deps.webhookSecret as string
    );
  } catch (err) {
    return {
      status: 400,
      body: {
        error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    };
  }

  if (!deps.store) {
    return {
      status: 503,
      body: {
        error:
          "Database is not configured (demo mode): verified events cannot be recorded idempotently, so processing is refused.",
      },
    };
  }

  if (await deps.store.hasEvent(event.id)) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  await deps.store.recordEvent(event.id, event.type, event);
  try {
    const action = await applyStripeEvent(event, deps);
    // Best-effort: close out any earlier failure rows for this event
    // (a retry that finally succeeded). The history is kept; a
    // failure-log problem must never fail an otherwise-applied event.
    try {
      await deps.store.markWebhookFailuresResolved(event.id);
    } catch {
      // Failure log unavailable (e.g. migration 017 not applied yet).
    }
    return { status: 200, body: { received: true, duplicate: false, action } };
  } catch (err) {
    // Roll back the idempotency record so Stripe's retry reprocesses.
    await deps.store.deleteEvent(event.id);
    // Best-effort failure log (B4): the ONLY durable trace of this
    // failure, kept separate from the exactly-once flow — a logging
    // failure must never mask the 500 Stripe needs to retry.
    try {
      await deps.store.recordWebhookFailure(event.id, event.type, errorSummary(err));
    } catch {
      // Failure log unavailable; the 500 + server logs remain.
    }
    return {
      status: 500,
      body: {
        error: `Event processing failed and will be retried: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    };
  }
}
