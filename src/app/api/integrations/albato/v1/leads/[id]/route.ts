import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ALBATO_PLATFORM } from "@/lib/integrations/rest/config";
import { restDeleteLead, restGetLead, restUpdateLead } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/leads/:id */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ALBATO_PLATFORM, "read", (ctx, deps) => restGetLead(ctx, deps, params.id));
}

/** PATCH /v1/leads/:id — update incl. status (emits lead.updated). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ALBATO_PLATFORM, "write", (ctx, deps) => restUpdateLead(ctx, deps, params.id, body));
}

/**
 * DELETE /v1/leads/:id — permanently deletes the lead. Exposed on the n8n-style platforms (n8n, Make, Pabbly, Albato, Activepieces)
 * — the Zapier routes do not expose it. Requires the write tier.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ALBATO_PLATFORM, "write", (ctx, deps) => restDeleteLead(ctx, deps, params.id));
}
