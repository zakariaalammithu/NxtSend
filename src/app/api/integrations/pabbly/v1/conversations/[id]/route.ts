import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { PABBLY_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetConversation } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/conversations/:id — thread (conversation + messages). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, PABBLY_PLATFORM, "read", (ctx, deps) => restGetConversation(ctx, deps, params.id));
}
