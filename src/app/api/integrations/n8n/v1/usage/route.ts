import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { N8N_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetUsage } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/usage — workspace usage + plan (same shape as the dashboard usage read). */
export async function GET(req: Request) {
  return withRestRoute(req, N8N_PLATFORM, "read", (ctx, deps) => restGetUsage(ctx, deps));
}
