import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierSendReply } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /v1/conversations/:id/replies — send an email inbox reply
 * via the existing sendInboxReply path (`{content, subject?,
 * idempotencyKey}` — the key is required; replays return the
 * original message, never re-send). LinkedIn conversations are
 * refused 422: no authorized LinkedIn provider exists.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierSendReply(ctx, deps, params.id, body));
}
