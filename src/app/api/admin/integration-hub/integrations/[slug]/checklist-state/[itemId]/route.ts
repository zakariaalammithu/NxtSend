import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { updateHubChecklistState } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string; itemId: string };
}

/**
 * PUT …/integrations/[slug]/checklist-state/[itemId] — upsert tracker
 * state for one item (sets completed_at when the state is done).
 */
export async function PUT(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const state = await updateHubChecklistState(
      gate.mode,
      gate.actor,
      params.slug,
      params.itemId,
      await readJsonBody(req)
    );
    return hubJson({ state });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
