import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import { restSearchAccounts } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withRestRoute(req, ZAPIER_PLATFORM, "read", (ctx, deps) =>
    restSearchAccounts(ctx, deps, new URL(req.url).searchParams)
  );
}
