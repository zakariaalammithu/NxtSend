import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restSendReply } from "@/lib/integrations/rest/api";

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
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, MAKE_PLATFORM, "write", (ctx, deps) => restSendReply(ctx, deps, params.id, body));
}
