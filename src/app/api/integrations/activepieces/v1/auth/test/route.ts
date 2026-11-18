import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restAuthTest } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /v1/auth/test — the activepieces connection check. Returns the
 * workspace name + user email activepieces shows as the connection
 * label. Never returns token material.
 */
export async function GET(req: Request) {
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "read", (ctx, deps) => restAuthTest(ctx, deps));
}
