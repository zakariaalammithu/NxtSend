import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";
import { getBillingState } from "@/lib/billing/state";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { resolveAppUrl } from "@/lib/billing/app-url";

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for the caller's workspace
 * (payment-method updates, invoices, cancellation inside Stripe).
 * Refuses honestly when billing is unconfigured or the workspace has
 * no Stripe customer yet — a portal cannot exist before a checkout.
 */
export async function POST() {
  const state = getBillingState();
  const stripe = getStripeClient();
  if (state !== "connected" || !stripe) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable the customer portal (see SETUP.md).",
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

  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace found for this account." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured.", state: "configuration_required" },
      { status: 503 }
    );
  }
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const customerId = (sub?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer exists for this workspace yet. Complete a checkout first; no payment method or subscription is on file.",
        state,
      },
      { status: 400 }
    );
  }

  const appUrlResolution = resolveAppUrl();
  if ("error" in appUrlResolution) {
    return NextResponse.json(
      { error: appUrlResolution.error, state: "configuration_required" },
      { status: 503 }
    );
  }
  const appUrl = appUrlResolution.url;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url, state });
}
