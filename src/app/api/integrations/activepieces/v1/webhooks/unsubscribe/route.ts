import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restUnsubscribeWebhook } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /v1/webhooks/unsubscribe `{id}` — idempotent; unknown id → 404. */
export async function POST(req: Request) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "write", (ctx, deps) => restUnsubscribeWebhook(ctx, deps, body));
}
