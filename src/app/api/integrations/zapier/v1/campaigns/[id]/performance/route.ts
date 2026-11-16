import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierCampaignPerformance } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/campaigns/:id/performance — real stats; `accepted` is always null (no data source). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierCampaignPerformance(ctx, deps, params.id)
  );
}
