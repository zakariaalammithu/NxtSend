import {
  hubErrorResponse,
  hubJson,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { refreshHubStatus } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/**
 * POST …/integrations/[slug]/status/refresh — LOCAL recomputation only
 * (expiry, rollups, vault configuration). No external status API
 * exists for the integration; this makes no external calls, writes
 * nothing, and never changes the stored status.
 */
export async function POST(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await refreshHubStatus(gate.mode, params.slug));
  } catch (err) {
    return hubErrorResponse(err);
  }
}
