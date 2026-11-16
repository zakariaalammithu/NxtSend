import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierListAccounts } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/accounts — connected accounts, read-only (LinkedIn accounts included where linked). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierListAccounts(ctx, deps));
}
