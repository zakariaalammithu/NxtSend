import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ALBATO_PLATFORM } from "@/lib/integrations/rest/config";
import { restListConversations } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/conversations — polling list (`q`, `limit` 1–100). */
export async function GET(req: Request) {
  return withRestRoute(req, ALBATO_PLATFORM, "read", (ctx, deps) =>
    restListConversations(ctx, deps, new URL(req.url).searchParams)
  );
}
