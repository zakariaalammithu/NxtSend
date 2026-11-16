import { NextResponse } from "next/server";
import { withZapierRoute, readZapierJsonBody } from "@/lib/integrations/zapier/route-helpers";
import { zapierAddLeadsToCampaign } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /v1/campaigns/:id/leads — enroll leads (`{lead_ids: [...]}`); returns enrolled/skipped. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readZapierJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withZapierRoute(req, "write", (ctx, deps) =>
    zapierAddLeadsToCampaign(ctx, deps, params.id, body)
  );
}
