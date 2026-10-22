import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  deleteHubTestAccount,
  updateHubTestAccount,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** PUT …/test-accounts/[id] — update (mark_verified stamps last_verified_at). */
export async function PUT(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const test_account = await updateHubTestAccount(
      gate.mode,
      gate.actor,
      params.id,
      await readJsonBody(req)
    );
    return hubJson({ test_account });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** DELETE …/test-accounts/[id] — audited delete. */
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await deleteHubTestAccount(gate.mode, gate.actor, params.id));
  } catch (err) {
    return hubErrorResponse(err);
  }
}
