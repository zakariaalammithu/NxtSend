import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";
import { getBillingState, getStripePriceId } from "@/lib/billing/state";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { resolveAppUrl } from "@/lib/billing/app-url";
import { isPlanId, type BillingInterval } from "@/lib/billing/plans";
import {
  shouldBlockNewCheckout,
  type SubscriptionRowLike,
} from "@/lib/billing/entitlement";

/**
 * POST /api/billing/checkout  { plan, interval? }
 *
 * Creates a Stripe Checkout session for the caller's workspace.
 * Honesty rules:
 *  - Billing state comes from env; when Stripe is not (fully)
 *    configured the route refuses with 503 + the derived state.
 *  - Creating a session is NOT a payment: this route never changes the
 *    workspace plan. Plan changes are applied only by the verified
 *    webhook handler when Stripe confirms the subscription.
 */
export async function POST(req: Request) {
  const state = getBillingState();
  const stripe = getStripeClient();
  if (state !== "connected" || !stripe) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable checkout (see SETUP.md). No checkout session was created and nothing was charged.",
        state,
      },
      { status: 503 }
    );
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured (demo mode).", state: "demo" },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: unknown; interval?: unknown };
  try {
    body = (await req.json()) as { plan?: unknown; interval?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isPlanId(body.plan) || body.plan === "free") {
    return NextResponse.json(
      { error: "A paid plan (starter, growth or agency) is required." },
      { status: 400 }
    );
  }
  const interval: BillingInterval = body.interval === "annual" ? "annual" : "monthly";

  const priceId = getStripePriceId(body.plan, interval);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `No Stripe Price ID configured for plan "${body.plan}" (${interval}). Set the corresponding STRIPE_PRICE_ID_* variable (see SETUP.md).`,
        state: "configuration_required",
      },
      { status: 503 }
    );
  }

  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace found for this account." },
      { status: 400 }
    );
  }

  // Resolve redirect URLs BEFORE creating any Stripe customer: in
  // production a missing/localhost NEXT_PUBLIC_APP_URL is a hard
  // configuration error, never a silent localhost fallback.
  const appUrlResolution = resolveAppUrl();
  if ("error" in appUrlResolution) {
    return NextResponse.json(
      { error: appUrlResolution.error, state: "configuration_required" },
      { status: 503 }
    );
  }
  const appUrl = appUrlResolution.url;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured.", state: "configuration_required" },
      { status: 503 }
    );
  }

  // Load the workspace's subscription record once — it decides both
  // the duplicate-subscription guard below and customer reuse.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("plan, status, current_period_end, stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Duplicate-subscription guard (P9 B2): while the stored
  // subscription still entitles this workspace to a paid plan, a new
  // Checkout would create a SECOND Stripe subscription billing
  // alongside the first (the webhook would then follow whichever
  // subscription's events arrive last). Plan changes for an active
  // subscription belong in the Customer Portal.
  if (shouldBlockNewCheckout(existing as SubscriptionRowLike | null)) {
    return NextResponse.json(
      {
        error:
          "This workspace already has an active Stripe subscription, so a new checkout would bill twice. Use “Manage Billing (Stripe Portal)” on the billing page to change plans, update payment details, or cancel.",
        state,
        code: "existing_subscription",
        usePortal: true,
      },
      { status: 409 }
    );
  }

  // Reuse or create the Stripe customer for this workspace. Only the
  // customer ID is persisted here — plan/status wait for the webhook.
  let customerId = (existing?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { workspace_id: workspaceId },
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert(
      { workspace_id: workspaceId, stripe_customer_id: customerId },
      { onConflict: "workspace_id" }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: workspaceId,
    metadata: { workspace_id: workspaceId, plan: body.plan, interval },
    success_url: `${appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
  });

  return NextResponse.json({
    url: session.url,
    state,
    note: "Checkout session created. The plan changes only after Stripe confirms payment via webhook.",
  });
}
