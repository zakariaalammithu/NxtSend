import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { N8N_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetAccount } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/accounts/:id — one connected account (n8n-only; read tier). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  return withRestRoute(req, N8N_PLATFORM, "read", (ctx, deps) =>
    restGetAccount(ctx, deps, params.id)
  );
}
