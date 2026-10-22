/**
 * Workspace invoice history (P9 B7) — read directly from Stripe for
 * the workspace's own Stripe customer, server-side only.
 *
 * Invoices are issued by Stripe; this module only lists and maps
 * them for display (date, description, amount, status, hosted
 * invoice link). It invents nothing: no customer or no invoices
 * yields an empty list, and the billing page keeps its
 * portal-delegation wording whenever Stripe is not configured.
 */

import type Stripe from "stripe";

export interface BillingInvoiceSummary {
  id: string;
  /** Stripe invoice number (e.g. "INV-1042"), when finalised. */
  number: string | null;
  /** ISO timestamp of invoice creation. */
  created_at: string;
  description: string;
  /** Invoice total in major currency units. */
  amount: number;
  currency: string | null;
  /** Stripe invoice status: draft / open / paid / uncollectible / void. */
  status: string | null;
  hosted_invoice_url: string | null;
}

/** Structural minimum of the Stripe client this module needs (trivially mockable). */
export interface InvoiceLister {
  invoices: {
    list(params: {
      customer: string;
      limit: number;
    }): Promise<{ data: Stripe.Invoice[] }>;
  };
}

export function mapStripeInvoice(invoice: Stripe.Invoice): BillingInvoiceSummary {
  const firstLine = invoice.lines?.data?.[0];
  const description =
    invoice.description ??
    firstLine?.description ??
    (invoice.number ? `Invoice ${invoice.number}` : "Subscription invoice");
  const totalCents = invoice.total ?? invoice.amount_paid ?? invoice.amount_due ?? 0;
  return {
    id: invoice.id,
    number: invoice.number ?? null,
    created_at: new Date((invoice.created ?? 0) * 1000).toISOString(),
    description,
    amount: totalCents / 100,
    currency: invoice.currency ?? null,
    status: invoice.status ?? null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
  };
}

export async function listWorkspaceInvoices(
  stripe: InvoiceLister,
  customerId: string,
  limit = 12
): Promise<BillingInvoiceSummary[]> {
  const page = await stripe.invoices.list({ customer: customerId, limit });
  return (page.data ?? []).map(mapStripeInvoice);
}
