import {
  hubErrorResponse,
  hubJson,
  readJsonBody,
  resolveHubGate,
} from "@/lib/integration-hub/route-helpers";
import { generateHubCopyPackage } from "@/lib/integration-hub/hub-server";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

/**
 * POST …/integrations/[slug]/copy-package — generate the Copy
 * Integration Package (format md|json). Secrets are included ONLY for
 * credential ids explicitly listed in `includeCredentialIds`, each
 * covered by the strict HUB_COPY_PACKAGE_GENERATE audit row written
 * before any decryption. The rendered package is never persisted.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await resolveHubGate();
  if (!gate.ok) return gate.response;
  try {
    const result = await generateHubCopyPackage(
      gate.mode,
      gate.actor,
      params.slug,
      await readJsonBody(req)
    );
    return hubJson(result, { noStore: true });
  } catch (err) {
    return hubErrorResponse(err);
  }
}
