import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierGetConversation } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/conversations/:id — thread (conversation + messages). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withZapierRoute(req, "read", (ctx, deps) => zapierGetConversation(ctx, deps, params.id));
}
