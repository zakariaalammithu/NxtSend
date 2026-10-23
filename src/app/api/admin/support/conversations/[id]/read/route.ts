import { NextRequest } from "next/server";
import { markSupportAgentRead } from "@/lib/support/admin-service";
import { withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/support/conversations/[id]/read — mark the agent
 * side read (watermarks + agent unread counter reset).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSupportAdmin(({ store, actor, permissions }) =>
    markSupportAgentRead(store, actor, permissions, params.id)
  );
}
