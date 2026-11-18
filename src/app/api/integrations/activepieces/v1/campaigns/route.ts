import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restListCampaigns, restCreateCampaign } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns — polling list (newest first, `after` cursor, `limit` 1–100). */
export async function GET(req: Request) {
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "read", (ctx, deps) =>
    restListCampaigns(ctx, deps, new URL(req.url).searchParams)
  );
}

/** POST /v1/campaigns — create, draft only (see api.ts). */
export async function POST(req: Request) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "write", (ctx, deps) => restCreateCampaign(ctx, deps, body));
}
