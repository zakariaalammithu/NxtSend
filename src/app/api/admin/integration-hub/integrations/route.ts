import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  createHubIntegration,
  listHubIntegrations,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

/** GET /api/admin/integration-hub/integrations — list integration records. */
export async function GET() {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson({ integrations: await listHubIntegrations(gate.mode) });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** POST /api/admin/integration-hub/integrations — create (draft/configuring only). */
export async function POST(req: Request) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const integration = await createHubIntegration(
      gate.mode,
      gate.actor,
      await readJsonBody(req)
    );
    return hubJson({ integration }, { status: 201 });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
