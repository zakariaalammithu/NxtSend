import { NextResponse } from "next/server";
import { publicPlatformSubscription } from "@/lib/integrations/rest/outbox";
import { resolveN8nWebhookRoute } from "../helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/n8n/webhooks/subscriptions — Bearer (n8n
 * OAuth token, read tier). Lists the workspace's ACTIVE n8n
 * webhook subscriptions (safe columns only — the per-subscription
 * HMAC secret is NEVER selected or returned).
 */
export async function GET(req: Request) {
  const resolved = await resolveN8nWebhookRoute(req, "read");
  if (!resolved.ok) return resolved.response;
  const subs = await resolved.store.listSubscriptions(resolved.ctx.workspaceId);
  return NextResponse.json({ subscriptions: subs.map((s) => publicPlatformSubscription(s)) });
}
