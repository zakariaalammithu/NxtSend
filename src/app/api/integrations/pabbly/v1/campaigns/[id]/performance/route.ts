import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { PABBLY_PLATFORM } from "@/lib/integrations/rest/config";
import { restCampaignPerformance } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns/:id/performance — real stats; `accepted` is always null (no data source). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, PABBLY_PLATFORM, "read", (ctx, deps) =>
    restCampaignPerformance(ctx, deps, params.id)
  );
}
