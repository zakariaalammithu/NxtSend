import {
  hubErrorResponse,
  hubJson,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { getHubOverview } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

/** GET /api/admin/integration-hub — overview rollups for every integration. */
export async function GET() {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson({ overview: await getHubOverview(gate.mode) });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
