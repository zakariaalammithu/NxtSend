import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { PABBLY_PLATFORM } from "@/lib/integrations/rest/config";
import { restReplaceCampaignSteps } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /v1/campaigns/:id/steps — replace the campaign's whole
 * sequence (`{steps: [{step_type, delay_hours?, subject?,
 * content?, config?}]}` — at least one step; email /
 * linkedin_message steps need non-empty content). The previous
 * steps are replaced, not merged.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, PABBLY_PLATFORM, "write", (ctx, deps) =>
    restReplaceCampaignSteps(ctx, deps, params.id, body)
  );
}
