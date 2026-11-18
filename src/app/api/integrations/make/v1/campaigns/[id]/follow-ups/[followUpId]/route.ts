import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { MAKE_PLATFORM } from "@/lib/integrations/rest/config";
import { restCancelFollowUp } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /v1/campaigns/:id/follow-ups/:followUpId — cancel a
 * queued follow-up. It will never be sent. Unknown id → 404.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; followUpId: string } }
) {
  return withRestRoute(req, MAKE_PLATFORM, "write", (ctx, deps) =>
    restCancelFollowUp(ctx, deps, params.id, params.followUpId)
  );
}
