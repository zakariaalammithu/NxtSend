import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restRemoveLeadFromCampaign } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** DELETE /v1/campaigns/:id/leads/:leadId — remove one enrollment (the lead record is kept). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; leadId: string } }
) {
  return withRestRoute(req, MAKE_PLATFORM, "write", (ctx, deps) =>
    restRemoveLeadFromCampaign(ctx, deps, params.id, params.leadId)
  );
}
