import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import {
  createHubCredential,
  listHubCredentials,
} from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/** GET …/integrations/[slug]/credentials — metadata + last4 only, never values. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const credentials = await listHubCredentials(gate.mode, params.slug);
    return hubJson({ credentials }, { noStore: true });
  } catch (err) {
    return hubErrorResponse(err);
  }
}

/**
 * POST …/integrations/[slug]/credentials — store a value encrypted.
 * Disabled in Demo Mode (503): demo never persists credential values.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const credential = await createHubCredential(
      gate.mode,
      gate.actor,
      params.slug,
      await readJsonBody(req)
    );
    return hubJson({ credential }, { status: 201, noStore: true });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
