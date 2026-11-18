import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { PABBLY_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetAccount } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/accounts/:id — one connected account (pabbly-only; read tier). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  return withRestRoute(req, PABBLY_PLATFORM, "read", (ctx, deps) =>
    restGetAccount(ctx, deps, params.id)
  );
}
