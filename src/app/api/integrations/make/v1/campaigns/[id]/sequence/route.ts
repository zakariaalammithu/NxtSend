import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetCampaignSequence } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns/:id/sequence — the campaign's steps, in order. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, MAKE_PLATFORM, "read", (ctx, deps) =>
    restGetCampaignSequence(ctx, deps, params.id)
  );
}
