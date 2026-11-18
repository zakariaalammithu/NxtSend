import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetAccountStatus } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /v1/accounts/:id/status — connection status of one account
 * (make-only; read tier). Recorded state from the account row, never a
 * live probe: `connected` is true only when the workspace-facing
 * status is "connected".
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  return withRestRoute(req, MAKE_PLATFORM, "read", (ctx, deps) =>
    restGetAccountStatus(ctx, deps, params.id)
  );
}
