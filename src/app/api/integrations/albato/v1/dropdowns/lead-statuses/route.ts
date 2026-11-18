import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ALBATO_PLATFORM } from "@/lib/integrations/rest/config";
import { restDropdownLeadStatuses } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/dropdowns/lead-statuses — the lead status values. */
export async function GET(req: Request) {
  return withRestRoute(req, ALBATO_PLATFORM, "read", () => Promise.resolve(restDropdownLeadStatuses()));
}
