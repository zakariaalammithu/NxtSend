import {
  hubErrorResponse,
  hubJson,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { getHubChecklists } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/** GET …/integrations/[slug]/checklists — item definitions merged with tracker state + rollup. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    return hubJson(await getHubChecklists(gate.mode, params.slug));
  } catch (err) {
    return hubErrorResponse(err);
  }
}
