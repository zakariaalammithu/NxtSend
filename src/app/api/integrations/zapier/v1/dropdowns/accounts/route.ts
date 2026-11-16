import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierDropdownAccounts } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierDropdownAccounts(ctx, deps)
  );
}
