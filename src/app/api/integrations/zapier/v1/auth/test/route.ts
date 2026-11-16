import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierAuthTest } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /v1/auth/test — the Zapier connection check. Returns the
 * workspace name + user email Zapier shows as the connection
 * label. Never returns token material.
 */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierAuthTest(ctx, deps));
}
