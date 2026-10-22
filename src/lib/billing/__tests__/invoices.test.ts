import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
  listWorkspaceInvoices,
  mapStripeInvoice,
  type InvoiceLister,
} from "../invoices";

function fakeInvoice(partial: Partial<Stripe.Invoice>): Stripe.Invoice {
  return {
    id: "in_123",
    object: "invoice",
    number: "INV-1042",
    created: 1_780_000_000, // 2026-05-28T20:26:40Z
    description: null,
    total: 4900,
    amount_paid: 4900,
    amount_due: 0,
    currency: "usd",
    status: "paid",
    hosted_invoice_url: "https://invoice.stripe.com/i/inv_123",
    lines: {
      data: [{ description: "Starter plan (monthly)" }],
    },
    ...partial,
  } as unknown as Stripe.Invoice;
}

function mockStripe(invoices: Stripe.Invoice[]): {
  stripe: InvoiceLister;
  calls: Array<{ customer: string; limit: number }>;
} {
  const calls: Array<{ customer: string; limit: number }> = [];
  const stripe: InvoiceLister = {
    invoices: {
      list: async (params) => {
        calls.push(params);
        return { data: invoices };
      },
    },
  };
  return { stripe, calls };
}

describe("mapStripeInvoice", () => {
  it("maps the display fields and falls back to the first line's description", () => {
    const summary = mapStripeInvoice(fakeInvoice({}));
    expect(summary).toEqual({
      id: "in_123",
      number: "INV-1042",
      created_at: "2026-05-28T20:26:40.000Z",
      description: "Starter plan (monthly)",
      amount: 49,
      currency: "usd",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/inv_123",
    });
  });

  it("prefers the invoice's own description, then its number", () => {
    expect(
      mapStripeInvoice(fakeInvoice({ description: "Annual renewal" })).description
    ).toBe("Annual renewal");
    expect(
      mapStripeInvoice(
        fakeInvoice({ lines: { data: [] } as unknown as Stripe.Invoice["lines"] })
      ).description
    ).toBe("Invoice INV-1042");
  });

  it("carries open/draft statuses and a null hosted URL without inventing one", () => {
    const summary = mapStripeInvoice(
      fakeInvoice({ status: "open", hosted_invoice_url: null, total: 14900 })
    );
    expect(summary.status).toBe("open");
    expect(summary.amount).toBe(149);
    expect(summary.hosted_invoice_url).toBeNull();
  });
});

describe("listWorkspaceInvoices (mocked Stripe client)", () => {
  it("lists only the given customer's invoices with a bounded limit", async () => {
    const { stripe, calls } = mockStripe([fakeInvoice({}), fakeInvoice({ id: "in_124" })]);
    const invoices = await listWorkspaceInvoices(stripe, "cus_123");
    expect(calls).toEqual([{ customer: "cus_123", limit: 12 }]);
    expect(invoices.map((i) => i.id)).toEqual(["in_123", "in_124"]);
  });

  it("returns an empty list when Stripe has no invoices for the customer", async () => {
    const { stripe } = mockStripe([]);
    expect(await listWorkspaceInvoices(stripe, "cus_none")).toEqual([]);
  });

  it("propagates Stripe API errors (the route turns them into a 502)", async () => {
    const stripe: InvoiceLister = {
      invoices: {
        list: async () => {
          throw new Error("stripe api down");
        },
      },
    };
    await expect(listWorkspaceInvoices(stripe, "cus_123")).rejects.toThrow(
      "stripe api down"
    );
  });
});
