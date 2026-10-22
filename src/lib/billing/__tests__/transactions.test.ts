import { describe, it, expect } from "vitest";
import { mapBillingEventToTransaction } from "../transactions";

function row(eventType: string, object: Record<string, unknown>) {
  return {
    event_id: `evt_${eventType}`,
    provider: "stripe",
    event_type: eventType,
    payload: { id: `evt_${eventType}`, type: eventType, data: { object } },
    processed_at: "2026-06-15T12:00:00.000Z",
  };
}

describe("mapBillingEventToTransaction", () => {
  it("keeps the existing generic mapping for checkout completions", () => {
    const tx = mapBillingEventToTransaction(
      row("checkout.session.completed", {
        amount_total: 4900,
        currency: "usd",
        status: "complete",
      })
    );
    expect(tx).toMatchObject({ amount: 49, currency: "usd", status: "complete" });
  });

  it("keeps the generic mapping for subscription/invoice events", () => {
    const tx = mapBillingEventToTransaction(
      row("invoice.payment_failed", { amount_due: 14900, currency: "usd", status: "open" })
    );
    // amount_paid absent → falls back through the chain to `amount` (absent) → null is NOT
    // expected here: amount_due is read by Stripe-shaped payloads via amount_paid/amount only.
    expect(tx.event_type).toBe("invoice.payment_failed");
    expect(tx.status).toBe("open");
  });

  it("shows a full refund as a refund of the refunded amount — not as revenue", () => {
    const tx = mapBillingEventToTransaction(
      row("charge.refunded", {
        amount: 4900,
        amount_refunded: 4900,
        currency: "usd",
        status: "succeeded", // the CHARGE's status — must not leak into the row
        refunded: true,
      })
    );
    expect(tx.amount).toBe(49);
    expect(tx.status).toBe("refunded");
  });

  it("labels a partial refund honestly and shows only the refunded amount", () => {
    const tx = mapBillingEventToTransaction(
      row("charge.refunded", {
        amount: 4900,
        amount_refunded: 1000,
        currency: "usd",
        status: "succeeded",
        refunded: false,
      })
    );
    expect(tx.amount).toBe(10);
    expect(tx.status).toBe("partially_refunded");
  });

  it("labels a created dispute as disputed with the disputed amount", () => {
    const tx = mapBillingEventToTransaction(
      row("charge.dispute.created", {
        amount: 14900,
        currency: "usd",
        status: "needs_response",
      })
    );
    expect(tx.amount).toBe(149);
    expect(tx.status).toBe("disputed");
  });

  it("shows the dispute outcome once closed (won / lost)", () => {
    expect(
      mapBillingEventToTransaction(
        row("charge.dispute.closed", { amount: 14900, currency: "usd", status: "won" })
      ).status
    ).toBe("dispute_won");
    expect(
      mapBillingEventToTransaction(
        row("charge.dispute.closed", { amount: 14900, currency: "usd", status: "lost" })
      ).status
    ).toBe("dispute_lost");
  });

  it("tolerates sparse payloads without inventing values", () => {
    const tx = mapBillingEventToTransaction(row("customer.subscription.deleted", {}));
    expect(tx.amount).toBeNull();
    expect(tx.status).toBeNull();
    expect(tx.currency).toBeNull();
  });
});
