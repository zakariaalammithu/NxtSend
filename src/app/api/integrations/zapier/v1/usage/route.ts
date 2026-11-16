import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierGetUsage } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/usage — workspace usage + plan (same shape as the dashboard usage read). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierGetUsage(ctx, deps));
}
