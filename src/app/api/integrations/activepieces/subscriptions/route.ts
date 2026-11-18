import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ActivepiecesSubscriptionEntry {
  id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivepiecesDeliveryEntry {
  id: string;
  event: string;
  subscription_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

/**
 * GET /api/integrations/activepieces/subscriptions — session-authenticated
 * webhook status for the signed-in user's workspace (used by the
 * activepieces detail page in the Integration Center). Mirrors the Zapier
 * subscriptions route.
 *
 * Live Supabase session required (401 without one); Demo Mode
 * refuses (503). Reads through the service role only, filtered
 * to platform='activepieces' (migration 031):
 *   - active + inactive activepieces subscriptions from
 *     zapier_webhook_subscriptions (safe columns only — the
 *     per-subscription HMAC `secret` is NEVER selected, so it can
 *     never leak here);
 *   - the 20 most recent activepieces deliveries from
 *     zapier_webhook_deliveries (payloads are NOT selected — they
 *     can contain lead data).
 * When migration 029 has not been applied the reads fail and the
 * route reports the failure honestly (500) instead of empty lists.
 */
export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "activepieces webhook status is unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: subs, error: subsError } = await ctx.admin
      .from("zapier_webhook_subscriptions")
      .select("id, event, target_url, active, created_at, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("platform", "activepieces")
      .order("created_at", { ascending: false });
    if (subsError) {
      return NextResponse.json(
        { error: `Failed to load activepieces subscriptions: ${subsError.message}` },
        { status: 500 }
      );
    }
    const { data: deliveries, error: deliveriesError } = await ctx.admin
      .from("zapier_webhook_deliveries")
      .select(
        "id, event, subscription_id, status, attempts, max_attempts, last_error, next_retry_at, created_at"
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("platform", "activepieces")
      .order("created_at", { ascending: false })
      .limit(20);
    if (deliveriesError) {
      return NextResponse.json(
        { error: `Failed to load activepieces deliveries: ${deliveriesError.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({
      mode: ctx.mode,
      subscriptions: (subs ?? []) as ActivepiecesSubscriptionEntry[],
      deliveries: (deliveries ?? []) as ActivepiecesDeliveryEntry[],
    });
  } catch (err) {
    console.error("[activepieces] Subscriptions load failed:", err);
    return NextResponse.json(
      { error: "Failed to load activepieces webhook status." },
      { status: 500 }
    );
  }
}
