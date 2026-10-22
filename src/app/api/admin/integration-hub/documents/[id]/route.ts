import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  deleteHubDocument,
  getHubDocument,
  updateHubDocument,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** GET …/documents/[id] — one document. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson({ document: await getHubDocument(gate.mode, params.id) });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** PUT …/documents/[id] — update (bumps version). */
export async function PUT(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const document = await updateHubDocument(
      gate.mode,
      gate.actor,
      params.id,
      await readJsonBody(req)
    );
    return hubJson({ document });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** DELETE …/documents/[id] — audited delete. */
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await deleteHubDocument(gate.mode, gate.actor, params.id));
  } catch (err) {
    return hubErrorResponse(err);
  }
}
