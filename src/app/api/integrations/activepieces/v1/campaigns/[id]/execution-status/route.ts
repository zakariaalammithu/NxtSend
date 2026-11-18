import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { ACTIVEPIECES_PLATFORM } from "@/lib/integrations/rest/config";
import { restGetSequenceExecutionStatus } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /v1/campaigns/:id/execution-status — per-campaign sequence
 * execution summary: total executions, counts by status, and a
 * per-step breakdown. Counts come from the real execution
 * records; a campaign with no executions reports total 0, never
 * invented numbers.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withRestRoute(req, ACTIVEPIECES_PLATFORM, "read", (ctx, deps) =>
    restGetSequenceExecutionStatus(ctx, deps, params.id)
  );
}
