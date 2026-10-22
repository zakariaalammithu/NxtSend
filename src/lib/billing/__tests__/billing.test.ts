import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { PLAN_CATALOG } from "../plans";
import { planLimits } from "@/lib/utils";
import { getBillingState, getStripePriceId, planForStripePriceId } from "../state";
import { checkLimit, canAdd, summarizeUsage, overLimitMetrics } from "../limits";
import {
  handleStripeWebhook,
  STRIPE_HANDLED_EVENT_TYPES,
  type BillingStore,
  type SubscriptionUpsert,
} from "../webhook";

// ── Plan catalog: single-sourced, existing prices only ─────────────────────

describe("PLAN_CATALOG", () => {
  it("carries the app's existing plan prices (billing page), no invented ones", () => {
    expect(PLAN_CATALOG.free.monthlyPriceUsd).toBe(0);
    expect(PLAN_CATALOG.starter.monthlyPriceUsd).toBe(49);
    expect(PLAN_CATALOG.growth.monthlyPriceUsd).toBe(149);
    expect(PLAN_CATALOG.agency.monthlyPriceUsd).toBe(299);
  });

  it("references planLimits instead of duplicating quotas", () => {
    for (const plan of ["free", "starter", "growth", "agency"] as const) {
      expect(PLAN_CATALOG[plan].limits).toBe(planLimits[plan]);
    }
  });
});

// ── State derivation ────────────────────────────────────────────────────────

describe("getBillingState", () => {
  it("is demo in demo mode even with keys present", () => {
    expect(
      getBillingState({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" }, "demo")
    ).toBe("demo");
  });
  it("is not_connected with nothing set", () => {
    expect(getBillingState({}, "supabase")).toBe("not_connected");
  });
  it("is configuration_required with only one secret", () => {
    expect(getBillingState({ STRIPE_SECRET_KEY: "sk_live_abc" }, "supabase")).toBe(
      "configuration_required"
    );
    expect(getBillingState({ STRIPE_WEBHOOK_SECRET: "whsec_abc" }, "supabase")).toBe(
      "configuration_required"
    );
  });
  it("is connected with both, and placeholders do not count", () => {
    expect(
      getBillingState(
        { STRIPE_SECRET_KEY: "sk_live_9f8e", STRIPE_WEBHOOK_SECRET: "whsec_9f8e" },
        "supabase"
      )
    ).toBe("connected");
    expect(
      getBillingState(
        { STRIPE_SECRET_KEY: "sk_test_your_stripe_secret_key", STRIPE_WEBHOOK_SECRET: "whsec_your_webhook_secret" },
        "supabase"
      )
    ).toBe("not_connected");
  });
});

describe("Stripe price ID resolution", () => {
  const env = {
    STRIPE_PRICE_ID_STARTER: "price_starter_m",
    STRIPE_PRICE_ID_STARTER_ANNUAL: "price_starter_y",
    STRIPE_PRICE_ID_GROWTH: "price_growth_m",
  };
  it("resolves configured IDs per plan/interval", () => {
    expect(getStripePriceId("starter", "monthly", env)).toBe("price_starter_m");
    expect(getStripePriceId("starter", "annual", env)).toBe("price_starter_y");
    expect(getStripePriceId("agency", "monthly", env)).toBeNull();
  });
  it("reverse-maps a price ID back to its plan", () => {
    expect(planForStripePriceId("price_growth_m", env)).toBe("growth");
    expect(planForStripePriceId("price_unknown", env)).toBeNull();
  });
  it("treats placeholder price IDs as unset", () => {
    expect(
      getStripePriceId("starter", "monthly", { STRIPE_PRICE_ID_STARTER: "price_your_id" })
    ).toBeNull();
  });
});

// ── Limit helpers ───────────────────────────────────────────────────────────

describe("plan limit helpers", () => {
  it("checkLimit reports remaining + percent + boundary behaviour", () => {
    const at = checkLimit("free", "leads", 500);
    expect(at.allowed).toBe(false);
    expect(at.remaining).toBe(0);
    expect(at.percentUsed).toBe(100);
    const under = checkLimit("free", "leads", 250);
    expect(under.allowed).toBe(true);
    expect(under.remaining).toBe(250);
    expect(under.percentUsed).toBe(50);
  });
  it("canAdd respects the cap exactly", () => {
    expect(canAdd("free", "campaigns", 2, 1)).toBe(true);
    expect(canAdd("free", "campaigns", 2, 2)).toBe(false);
    expect(canAdd("free", "campaigns", 3, 0)).toBe(true);
  });
  it("summarizeUsage covers every metric and flags over-limit ones", () => {
    const summary = summarizeUsage("free", { leads: 600, campaigns: 1 });
    expect(summary).toHaveLength(4);
    const over = overLimitMetrics(summary);
    expect(over.map((o) => o.metric)).toEqual(["leads"]);
  });
});

// ── Webhook: signature verification + idempotency ───────────────────────────

const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";
const PRICE_ENV = { STRIPE_PRICE_ID_STARTER: "price_starter_m" };

class FakeBillingStore implements BillingStore {
  events = new Map<string, unknown>();
  upserts: SubscriptionUpsert[] = [];
  statusByCustomer = new Map<string, string>();
  failures: Array<{
    eventId: string;
    eventType: string;
    errorSummary: string;
    resolved: boolean;
  }> = [];
  failOnRecordFailure = false;
  async hasEvent(id: string) {
    return this.events.has(id);
  }
  async recordEvent(id: string) {
    this.events.set(id, true);
  }
  async deleteEvent(id: string) {
    this.events.delete(id);
  }
  async getWorkspaceIdByCustomerId(customerId: string) {
    return customerId === "cus_123" ? "ws_1" : null;
  }
  async upsertSubscription(row: SubscriptionUpsert) {
    this.upserts.push(row);
  }
  async setSubscriptionStatusByCustomer(customerId: string, status: string) {
    this.statusByCustomer.set(customerId, status);
  }
  async recordWebhookFailure(eventId: string, eventType: string, errorSummary: string) {
    if (this.failOnRecordFailure) throw new Error("failure log unavailable");
    this.failures.push({ eventId, eventType, errorSummary, resolved: false });
  }
  async markWebhookFailuresResolved(eventId: string) {
    for (const failure of this.failures) {
      if (failure.eventId === eventId) failure.resolved = true;
    }
  }
}

function fakeSubscription(): Stripe.Subscription {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_starter_m" },
          current_period_end: 1_900_000_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function signedRequest(stripe: Stripe, payload: string, secret = WEBHOOK_SECRET) {
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return header;
}

describe("handleStripeWebhook", () => {
  const stripe = new Stripe("sk_test_dummy_key_for_offline_verification");
  const checkoutPayload = JSON.stringify({
    id: "evt_checkout_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        object: "checkout.session",
        client_reference_id: "ws_1",
        subscription: "sub_123",
        customer: "cus_123",
      },
    },
  });

  function deps(store: BillingStore) {
    return {
      stripe,
      webhookSecret: WEBHOOK_SECRET,
      store,
      priceToPlan: (id: string) => planForStripePriceId(id, PRICE_ENV),
      retrieveSubscription: async () => fakeSubscription(),
    };
  }

  it("rejects with 503 when the webhook secret is not configured", async () => {
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: "t=1,v1=abc",
      deps: { ...deps(new FakeBillingStore()), webhookSecret: undefined },
    });
    expect(result.status).toBe(503);
  });

  it("rejects a tampered payload (signature over different bytes)", async () => {
    const header = signedRequest(stripe, checkoutPayload);
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload.replace("ws_1", "ws_2"),
      signature: header,
      deps: deps(new FakeBillingStore()),
    });
    expect(result.status).toBe(400);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const header = signedRequest(stripe, checkoutPayload, "whsec_another_secret");
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: deps(new FakeBillingStore()),
    });
    expect(result.status).toBe(400);
  });

  it("applies a verified checkout completion exactly once (idempotent)", async () => {
    const store = new FakeBillingStore();
    const header = signedRequest(stripe, checkoutPayload);

    const first = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: deps(store),
    });
    expect(first.status).toBe(200);
    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0]).toMatchObject({
      workspaceId: "ws_1",
      plan: "starter",
      status: "active",
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      stripePriceId: "price_starter_m",
    });

    const second = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: deps(store),
    });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(store.upserts).toHaveLength(1);
  });

  it("rolls back the idempotency record when applying fails (retry can succeed)", async () => {
    const store = new FakeBillingStore();
    const header = signedRequest(stripe, checkoutPayload);
    const failing = {
      ...deps(store),
      retrieveSubscription: async () => {
        throw new Error("stripe api down");
      },
    };
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: failing,
    });
    expect(result.status).toBe(500);
    expect(await store.hasEvent("evt_checkout_1")).toBe(false);
  });

  it("marks the subscription past_due on a verified payment failure", async () => {
    const payload = JSON.stringify({
      id: "evt_invoice_fail",
      object: "event",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", object: "invoice", customer: "cus_123" } },
    });
    const store = new FakeBillingStore();
    const result = await handleStripeWebhook({
      rawBody: payload,
      signature: signedRequest(stripe, payload),
      deps: deps(store),
    });
    expect(result.status).toBe(200);
    expect(store.statusByCustomer.get("cus_123")).toBe("past_due");
  });

  // ── B3: refunds & disputes are recorded through the same pipeline ──

  it("registers refund/dispute events in the handled-event list", () => {
    expect(STRIPE_HANDLED_EVENT_TYPES).toContain("charge.refunded");
    expect(STRIPE_HANDLED_EVENT_TYPES).toContain("charge.dispute.created");
    expect(STRIPE_HANDLED_EVENT_TYPES).toContain("charge.dispute.closed");
  });

  it("records a verified refund exactly once, without touching the subscription", async () => {
    const payload = JSON.stringify({
      id: "evt_refund_1",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_123",
          object: "charge",
          customer: "cus_123",
          amount: 4900,
          amount_refunded: 4900,
          currency: "usd",
          status: "succeeded",
          refunded: true,
        },
      },
    });
    const store = new FakeBillingStore();
    const first = await handleStripeWebhook({
      rawBody: payload,
      signature: signedRequest(stripe, payload),
      deps: deps(store),
    });
    expect(first.status).toBe(200);
    expect(first.body.action).toBe("refund_recorded");
    // Recorded for the admin view; NO subscription effect.
    expect(await store.hasEvent("evt_refund_1")).toBe(true);
    expect(store.upserts).toHaveLength(0);
    expect(store.statusByCustomer.size).toBe(0);

    const second = await handleStripeWebhook({
      rawBody: payload,
      signature: signedRequest(stripe, payload),
      deps: deps(store),
    });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(store.failures).toHaveLength(0);
  });

  it("records dispute creation and closure for admin visibility", async () => {
    const store = new FakeBillingStore();
    for (const [id, type, action] of [
      ["evt_dispute_open", "charge.dispute.created", "dispute_recorded"],
      ["evt_dispute_shut", "charge.dispute.closed", "dispute_closed_recorded"],
    ] as const) {
      const payload = JSON.stringify({
        id,
        object: "event",
        type,
        data: {
          object: {
            id: "dp_123",
            object: "dispute",
            charge: "ch_123",
            amount: 4900,
            currency: "usd",
            status: type.endsWith("created") ? "needs_response" : "won",
          },
        },
      });
      const result = await handleStripeWebhook({
        rawBody: payload,
        signature: signedRequest(stripe, payload),
        deps: deps(store),
      });
      expect(result.status).toBe(200);
      expect(result.body.action).toBe(action);
      expect(await store.hasEvent(id)).toBe(true);
    }
    expect(store.upserts).toHaveLength(0);
    expect(store.statusByCustomer.size).toBe(0);
  });

  // ── B4: apply failures land in the separate failure log ────────────

  it("logs the failure, deletes the event record (retry stays possible), returns 500", async () => {
    const store = new FakeBillingStore();
    const header = signedRequest(stripe, checkoutPayload);
    const failing = {
      ...deps(store),
      retrieveSubscription: async () => {
        throw new Error("stripe api down");
      },
    };
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: failing,
    });
    expect(result.status).toBe(500);
    // Exactly-once flow untouched: the idempotency record is gone.
    expect(await store.hasEvent("evt_checkout_1")).toBe(false);
    // ...but the failure itself is durably visible.
    expect(store.failures).toHaveLength(1);
    expect(store.failures[0]).toMatchObject({
      eventId: "evt_checkout_1",
      eventType: "checkout.session.completed",
      resolved: false,
    });
    expect(store.failures[0].errorSummary).toContain("stripe api down");
  });

  it("marks the failure resolved when a redelivery finally succeeds — history kept", async () => {
    const store = new FakeBillingStore();
    const header = signedRequest(stripe, checkoutPayload);
    const failing = {
      ...deps(store),
      retrieveSubscription: async () => {
        throw new Error("stripe api down");
      },
    };
    const failed = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: failing,
    });
    expect(failed.status).toBe(500);
    expect(store.failures).toHaveLength(1);

    const retried = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: deps(store),
    });
    expect(retried.status).toBe(200);
    expect(store.upserts).toHaveLength(1);
    // The failure row is NOT deleted — it is marked resolved.
    expect(store.failures).toHaveLength(1);
    expect(store.failures[0].resolved).toBe(true);
  });

  it("still returns 500 when the failure log itself is unavailable", async () => {
    const store = new FakeBillingStore();
    store.failOnRecordFailure = true;
    const header = signedRequest(stripe, checkoutPayload);
    const failing = {
      ...deps(store),
      retrieveSubscription: async () => {
        throw new Error("stripe api down");
      },
    };
    const result = await handleStripeWebhook({
      rawBody: checkoutPayload,
      signature: header,
      deps: failing,
    });
    expect(result.status).toBe(500);
    expect(await store.hasEvent("evt_checkout_1")).toBe(false);
  });
});
