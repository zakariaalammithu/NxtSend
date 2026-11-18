import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restSearchLeads } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withRestRoute(req, MAKE_PLATFORM, "read", (ctx, deps) =>
    restSearchLeads(ctx, deps, new URL(req.url).searchParams)
  );
}
