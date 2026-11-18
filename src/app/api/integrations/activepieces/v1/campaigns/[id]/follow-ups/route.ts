import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restListScheduledFollowUps, restScheduleFollowUp } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /v1/campaigns/:id/follow-ups — scheduled (still-queued)
 * follow-up replies for the workspace, earliest due first.
 * Scheduled replies are workspace-scoped in the data model (no
 * campaign link exists), so the campaign segment only verifies
 * the campaign exists — see docs/integrations/providers/automation-activepieces.md.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "read", (ctx, deps) =>
    restListScheduledFollowUps(ctx, deps, params.id)
  );
}

/**
 * POST /v1/campaigns/:id/follow-ups — schedule a reply
 * (`{conversation_id, body, scheduled_at}` — ISO timestamp).
 * Scheduling stores a row and sends NOTHING immediately; the
 * worker sends due rows. The conversation must exist in this
 * workspace.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "write", (ctx, deps) =>
    restScheduleFollowUp(ctx, deps, params.id, body)
  );
}
