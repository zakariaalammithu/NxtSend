import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetLead, restUpdateLead } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/leads/:id */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ZAPIER_PLATFORM, "read", (ctx, deps) => restGetLead(ctx, deps, params.id));
}

/** PATCH /v1/leads/:id — update incl. status (emits lead.updated). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ZAPIER_PLATFORM, "write", (ctx, deps) => restUpdateLead(ctx, deps, params.id, body));
}
