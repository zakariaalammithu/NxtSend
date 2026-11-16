import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierGetLead, zapierUpdateLead } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/leads/:id */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierGetLead(ctx, deps, params.id));
}

/** PATCH /v1/leads/:id — update incl. status (emits lead.updated). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierUpdateLead(ctx, deps, params.id, body));
}
