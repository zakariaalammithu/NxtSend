import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restSubscribeWebhook } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /v1/webhooks/subscribe `{event, target_url}` — activepieces REST
 * Hook subscribe. Returns `{id, event, target_url}` only: the
 * per-subscription HMAC secret is generated server-side and NEVER
 * returned. A duplicate active subscription returns the existing id.
 */
export async function POST(req: Request) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "write", (ctx, deps) => restSubscribeWebhook(ctx, deps, body));
}
