import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restDropdownAccounts } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withRestRoute(req, MAKE_PLATFORM, "read", (ctx, deps) =>
    restDropdownAccounts(ctx, deps)
  );
}
