import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierListConversations } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/conversations — polling list (`q`, `limit` 1–100). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierListConversations(ctx, deps, new URL(req.url).searchParams)
  );
}
