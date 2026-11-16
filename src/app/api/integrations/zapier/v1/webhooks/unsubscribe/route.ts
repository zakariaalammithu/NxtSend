import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierUnsubscribeWebhook } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /v1/webhooks/unsubscribe `{id}` — idempotent; unknown id → 404. */
export async function POST(req: Request) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierUnsubscribeWebhook(ctx, deps, body));
}
