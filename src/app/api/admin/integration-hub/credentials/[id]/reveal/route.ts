import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { revealHubCredential } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/**
 * POST …/credentials/[id]/reveal — strict-audited disclosure.
 * The audit row is written BEFORE decryption; if the audit insert
 * fails the request fails (500) and no value is returned. The value
 * appears ONLY in this response. Refused in Demo Mode (503).
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const result = await revealHubCredential(
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
