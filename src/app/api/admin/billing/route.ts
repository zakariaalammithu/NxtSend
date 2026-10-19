import { NextResponse } from "next/server";
import {
  getBillingOverview,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/billing — Admin → Billing (Transactions, Revenue,
 * Subscriptions pages share this source).
 * Live mode: billing_events (written only by the signature-verified
 * Stripe webhook) + subscriptions. Revenue counts ONLY subscriptions
 * with a Stripe subscription id in an active/trialing state — nothing
 * is ever invented or estimated.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const overview = await getBillingOverview(gate.mode);
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[Admin] Failed to load billing overview:", err);
    return NextResponse.json(
      { error: "Failed to load billing overview" },
      { status: 500 }
    );
  }
}
