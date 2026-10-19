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
}

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
    default:
      return "recorded_no_action";
  }
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
    return { status: 200, body: { received: true, duplicate: false, action } };
  } catch (err) {
    // Roll back the idempotency record so Stripe's retry reprocesses.
    await deps.store.deleteEvent(event.id);
    return {
      status: 500,
      body: {
        error: `Event processing failed and will be retried: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    };
  }
}
