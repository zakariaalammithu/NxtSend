import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { copyHubCredential } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/**
 * POST …/credentials/[id]/copy — strict-audited disclosure for the
 * clipboard flow (Stage C calls this from the copy click gesture).
 * Same discipline as reveal: audit first, value only in this response,
 * refused in Demo Mode (503).
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const result = await copyHubCredential(
      gate.mode,
      gate.actor,
      params.id,
      await readJsonBody(req)
    );
    return hubJson(result, { noStore: true });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
