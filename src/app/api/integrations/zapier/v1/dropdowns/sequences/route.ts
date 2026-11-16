import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierDropdownSequences } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/dropdowns/sequences?campaign_id=… — steps of one campaign (steps belong to a campaign). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierDropdownSequences(ctx, deps, new URL(req.url).searchParams)
  );
}
