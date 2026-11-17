import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { N8N_PLATFORM } from "@/lib/integrations/rest/config";
import { restSearchConversations } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withRestRoute(req, N8N_PLATFORM, "read", (ctx, deps) =>
    restSearchConversations(ctx, deps, new URL(req.url).searchParams)
  );
}
