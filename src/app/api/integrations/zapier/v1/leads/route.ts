import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierListLeads, zapierCreateLead } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/leads — polling list (newest first, `after` cursor, `limit` 1–100). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierListLeads(ctx, deps, new URL(req.url).searchParams)
  );
}

/** POST /v1/leads — create (dedups by email, returns `{lead, duplicate}`). */
export async function POST(req: Request) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) => zapierCreateLead(ctx, deps, body));
}
