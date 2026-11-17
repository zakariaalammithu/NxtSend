import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import { restAddLeadsToCampaign } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /v1/campaigns/:id/leads — enroll leads (`{lead_ids: [...]}`); returns enrolled/skipped. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, ZAPIER_PLATFORM, "write", (ctx, deps) =>
    restAddLeadsToCampaign(ctx, deps, params.id, body)
  );
}
