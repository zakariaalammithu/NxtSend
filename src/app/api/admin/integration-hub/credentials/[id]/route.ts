import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  deleteHubCredential,
  updateHubCredential,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** PUT …/credentials/[id] — metadata update; a `value` field rotates the secret. */
export async function PUT(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const credential = await updateHubCredential(
      gate.mode,
      gate.actor,
      params.id,
      await readJsonBody(req)
    );
    return hubJson({ credential }, { noStore: true });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** DELETE …/credentials/[id] — audited delete. */
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(
      await deleteHubCredential(gate.mode, gate.actor, params.id),
      { noStore: true }
    );
  } catch (err) {
    return hubErrorResponse(err);
  }
}
