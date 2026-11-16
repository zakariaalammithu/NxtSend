import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierSubscribeWebhook } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /v1/webhooks/subscribe `{event, target_url}` — Zapier REST
 * Hook subscribe. Returns `{id, event, target_url}` only: the
 * per-subscription HMAC secret is generated server-side and NEVER
 * returned. A duplicate active subscription returns the existing id.
 */
export async function POST(req: Request) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierSubscribeWebhook(ctx, deps, body));
}
