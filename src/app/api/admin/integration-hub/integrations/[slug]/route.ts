import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  deleteHubIntegration,
  getHubIntegrationDetail,
  updateHubIntegration,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/** GET …/integrations/[slug] — full detail (credentials are metadata-only). */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await getHubIntegrationDetail(gate.mode, params.slug));
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** PUT …/integrations/[slug] — update; status changes are audited from→to. */
export async function PUT(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const integration = await updateHubIntegration(
      gate.mode,
      gate.actor,
      params.slug,
      await readJsonBody(req)
    );
    return hubJson({ integration });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** DELETE …/integrations/[slug] — delete (children cascade). */
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await deleteHubIntegration(gate.mode, gate.actor, params.slug));
  } catch (err) {
    return hubErrorResponse(err);
  }
}
