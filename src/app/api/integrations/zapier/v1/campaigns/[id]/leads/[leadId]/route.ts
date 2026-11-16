import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierRemoveLeadFromCampaign } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** DELETE /v1/campaigns/:id/leads/:leadId — remove one enrollment (the lead record is kept). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; leadId: string } }
) {
  return withZapierRoute(req, "write", (ctx, deps) =>
    zapierRemoveLeadFromCampaign(ctx, deps, params.id, params.leadId)
  );
}
