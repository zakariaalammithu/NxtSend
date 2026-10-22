import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  createHubDocument,
  listHubDocuments,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/** GET …/integrations/[slug]/documents — the integration's documents + Hub-global ones. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson({
      documents: await listHubDocuments(gate.mode, params.slug),
    });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/** POST …/integrations/[slug]/documents — create a document (version 1). */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const document = await createHubDocument(
      gate.mode,
      gate.actor,
      params.slug,
      await readJsonBody(req)
    );
    return hubJson({ document }, { status: 201 });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
