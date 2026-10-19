import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { createSupabaseBillingStore } from "@/lib/billing/store";
import { planForStripePriceId } from "@/lib/billing/state";

/**
 * POST /api/webhooks/stripe
 *
 * The ONLY path that changes a workspace's plan/status from Stripe.
 * Signature verification is the SDK's constructEvent over the raw body;
 * events are deduplicated in `billing_events` before being applied.
 * Unconfigured (no secret) => 503 rejection, never silent acceptance.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const admin = createAdminClient();
  const stripe = getStripeClient();

  const result = await handleStripeWebhook({
    rawBody,
    signature: req.headers.get("stripe-signature"),
    deps: {
      stripe,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      store: admin ? createSupabaseBillingStore(admin) : null,
      priceToPlan: (priceId) => planForStripePriceId(priceId),
      retrieveSubscription: async (id) => {
        if (!stripe) throw new Error("Stripe client unavailable");
        return stripe.subscriptions.retrieve(id);
      },
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
