import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import { restListAccounts } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/accounts — connected accounts, read-only (LinkedIn accounts included where linked). */
export async function GET(req: Request) {
  return withRestRoute(req, ZAPIER_PLATFORM, "read", (ctx, deps) => restListAccounts(ctx, deps));
}
