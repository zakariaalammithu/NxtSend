import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierGetCampaign, zapierUpdateCampaign } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns/:id (includes steps). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierGetCampaign(ctx, deps, params.id));
}

/** PATCH /v1/campaigns/:id — name/type/description; status moves use the action endpoints' rules. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierUpdateCampaign(ctx, deps, params.id, body));
}
