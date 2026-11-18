import { NextResponse } from "next/server";
import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restCampaignAction } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = ["pause", "resume", "stop", "archive"] as const;

/**
 * POST /v1/campaigns/:id/pause | resume | stop | archive.
 * stop → archived. Same transition rules as the MCP adapter
 * (pause needs active, resume needs paused, stop/archive refuse
 * an already-archived campaign).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; action: string } }
) {
  if (!(ACTIONS as readonly string[]).includes(params.action)) {
    return NextResponse.json(
      { error: "action must be one of: pause, resume, stop, archive.", code: "invalid_action" },
      { status: 400 }
    );
  }
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "write", (ctx, deps) =>
    restCampaignAction(ctx, deps, params.id, params.action as (typeof ACTIONS)[number])
  );
}
