import { describe, it, expect } from "vitest";
import {
  resolveEntitlement,
  shouldBlockNewCheckout,
  type SubscriptionRowLike,
} from "../entitlement";

// Fixed clock so period-end comparisons are deterministic.
const NOW = new Date("2026-06-15T12:00:00.000Z");
const FUTURE = "2026-07-01T00:00:00.000Z"; // paid-through date ahead of NOW
const PAST = "2026-06-01T00:00:00.000Z"; // paid-through date behind NOW

function sub(partial: Partial<SubscriptionRowLike>): SubscriptionRowLike {
  return { plan: "growth", status: "active", current_period_end: FUTURE, ...partial };
}

describe("resolveEntitlement — fallback behaviour (unchanged from before)", () => {
  it("no subscription row → caller fallback applies", () => {
    expect(resolveEntitlement(null, "growth", NOW)).toMatchObject({
      plan: "growth",
      basis: "stored_plan",
      status: null,
    });
    expect(resolveEntitlement(null, "free", NOW).plan).toBe("free");
  });

  it("row with no plan yet (abandoned-checkout customer row) → fallback applies", () => {
    expect(
      resolveEntitlement({ plan: null, status: "trialing", current_period_end: null }, "starter", NOW)
    ).toMatchObject({ plan: "starter", basis: "stored_plan" });
  });

  it("stored free plan → free, whatever the status", () => {
    expect(resolveEntitlement(sub({ plan: "free", status: "trialing" }), "free", NOW)).toMatchObject({
      plan: "free",
      basis: "stored_plan",
    });
    expect(resolveEntitlement(sub({ plan: "free", status: "canceled" }), "free", NOW).plan).toBe(
      "free"
    );
  });
});

describe("resolveEntitlement — paid plan matrix (status × period)", () => {
  it("active + period open → paid plan applies", () => {
    expect(resolveEntitlement(sub({ status: "active" }), "free", NOW)).toMatchObject({
      plan: "growth",
      basis: "active",
      status: "active",
      currentPeriodEnd: FUTURE,
    });
  });

  it("trialing + period open → paid plan applies", () => {
    expect(resolveEntitlement(sub({ status: "trialing" }), "free", NOW)).toMatchObject({
      plan: "growth",
      basis: "trialing",
    });
  });

  it("active + no period end recorded → paid plan applies (lapse cannot be proven)", () => {
    expect(
      resolveEntitlement(sub({ status: "active", current_period_end: null }), "free", NOW).plan
    ).toBe("growth");
  });

  it("active + period ended → Free (lapsed record; renewal events never arrived)", () => {
    expect(
      resolveEntitlement(sub({ status: "active", current_period_end: PAST }), "free", NOW)
    ).toMatchObject({ plan: "free", basis: "free_downgrade" });
  });

  it("trialing + period ended → Free", () => {
    expect(
      resolveEntitlement(sub({ status: "trialing", current_period_end: PAST }), "free", NOW)
    ).toMatchObject({ plan: "free", basis: "free_downgrade" });
  });

  it("past_due + period open → paid plan kept (grace = the period already paid for)", () => {
    expect(resolveEntitlement(sub({ status: "past_due" }), "free", NOW)).toMatchObject({
      plan: "growth",
      basis: "past_due_grace",
    });
  });

  it("past_due + period ended → Free (grace exhausted)", () => {
    expect(
      resolveEntitlement(sub({ status: "past_due", current_period_end: PAST }), "free", NOW)
    ).toMatchObject({ plan: "free", basis: "free_downgrade" });
  });

  it("past_due + no paid-through date known → Free (no defined grace)", () => {
    expect(
      resolveEntitlement(sub({ status: "past_due", current_period_end: null }), "free", NOW)
    ).toMatchObject({ plan: "free", basis: "free_downgrade" });
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "some_future_status"])(
    "status %s → Free, period open or not",
    (status) => {
      expect(resolveEntitlement(sub({ status }), "free", NOW)).toMatchObject({
        plan: "free",
        basis: "free_downgrade",
      });
      expect(
        resolveEntitlement(sub({ status, current_period_end: PAST }), "free", NOW).plan
      ).toBe("free");
    }
  );

  it("missing status on a paid row → Free (no proof of entitlement)", () => {
    expect(resolveEntitlement(sub({ status: null }), "free", NOW)).toMatchObject({
      plan: "free",
      basis: "free_downgrade",
    });
  });
});

describe("shouldBlockNewCheckout — duplicate-subscription guard (B2)", () => {
  it("blocks while a paid subscription is active or trialing", () => {
    expect(shouldBlockNewCheckout(sub({ status: "active" }), NOW)).toBe(true);
    expect(shouldBlockNewCheckout(sub({ status: "trialing" }), NOW)).toBe(true);
  });

  it("blocks during past_due grace (the subscription still exists in Stripe)", () => {
    expect(shouldBlockNewCheckout(sub({ status: "past_due" }), NOW)).toBe(true);
  });

  it("allows checkout when there is no subscription row", () => {
    expect(shouldBlockNewCheckout(null, NOW)).toBe(false);
  });

  it("allows checkout for a customer-only row (no plan granted yet)", () => {
    expect(
      shouldBlockNewCheckout(
        { plan: null, status: "trialing", current_period_end: null },
        NOW
      )
    ).toBe(false);
  });

  it("allows re-subscribing after cancellation or lapse", () => {
    expect(shouldBlockNewCheckout(sub({ status: "canceled" }), NOW)).toBe(false);
    expect(
      shouldBlockNewCheckout(sub({ status: "active", current_period_end: PAST }), NOW)
    ).toBe(false);
    expect(
      shouldBlockNewCheckout(sub({ status: "past_due", current_period_end: PAST }), NOW)
    ).toBe(false);
  });

  it("allows checkout for a free-plan row", () => {
    expect(shouldBlockNewCheckout(sub({ plan: "free", status: "trialing" }), NOW)).toBe(false);
  });
});
