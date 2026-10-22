import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";
import { getBillingState } from "@/lib/billing/state";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { listWorkspaceInvoices } from "@/lib/billing/invoices";

/**
 * GET /api/billing/invoices
 *
 * The signed-in workspace's Stripe invoice history, read live from
 * Stripe for the workspace's own customer (P9 B7). Read-only: it
 * never creates customers, sessions, or charges. When billing is
 * not configured it refuses with the derived state (503) so the
 * billing page keeps its honest "invoices live in the Stripe
 * portal" panel instead of a fake list.
 */
export async function GET() {
  const state = getBillingState();
  const stripe = getStripeClient();
  if (state !== "connected" || !stripe) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable invoice history (see SETUP.md).",
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
    // No Stripe customer yet: an honest empty list, not an error.
    return NextResponse.json({ state, invoices: [], reason: "no_customer" });
  }

  try {
    const invoices = await listWorkspaceInvoices(stripe, customerId);
    return NextResponse.json({ state, invoices });
  } catch {
    return NextResponse.json(
      { error: "Invoice history could not be loaded from Stripe. Please try again.", state },
      { status: 502 }
    );
  }
}
