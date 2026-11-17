import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { N8N_PLATFORM } from "@/lib/integrations/rest/config";
import { restDropdownSequences } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/dropdowns/sequences?campaign_id=… — steps of one campaign (steps belong to a campaign). */
export async function GET(req: Request) {
  return withRestRoute(req, N8N_PLATFORM, "read", (ctx, deps) =>
    restDropdownSequences(ctx, deps, new URL(req.url).searchParams)
  );
}
