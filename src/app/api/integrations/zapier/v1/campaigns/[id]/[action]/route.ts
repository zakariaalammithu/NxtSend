import { NextResponse } from "next/server";
import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierCampaignAction } from "@/lib/integrations/zapier/api";

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
  return withZapierRoute(req, "write", (ctx, deps) =>
    zapierCampaignAction(ctx, deps, params.id, params.action as (typeof ACTIONS)[number])
  );
}
