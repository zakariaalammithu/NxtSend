import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierDropdownLeadStatuses } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/dropdowns/lead-statuses — the lead status values. */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", () => Promise.resolve(zapierDropdownLeadStatuses()));
}
