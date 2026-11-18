import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ALBATO_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetCampaign, restUpdateCampaign } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns/:id (includes steps). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ALBATO_PLATFORM, "read", (ctx, deps) => restGetCampaign(ctx, deps, params.id));
}

/** PATCH /v1/campaigns/:id — name/type/description; status moves use the action endpoints' rules. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ALBATO_PLATFORM, "write", (ctx, deps) => restUpdateCampaign(ctx, deps, params.id, body));
}
