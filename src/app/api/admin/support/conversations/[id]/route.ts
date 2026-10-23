import { NextRequest } from "next/server";
import {
  getSupportThread,
  updateSupportConversation,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/conversations/[id] — the full thread for the
 * inbox: messages INCLUDING internal notes, plus the conversation
 * event timeline. (Visitor projections never include notes.)
 *
 * PATCH — { status?, assignee_id? }: resolve/reopen/status changes
 * and assignment. Agents claim unassigned conversations for
 * themselves; assigning to another agent or unassigning someone
 * else's conversation requires a super admin. Every change appends a
 * conversation event and is mirrored into audit_logs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSupportAdmin(({ store, actor, permissions }) =>
    getSupportThread(store, actor, permissions, params.id)
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportConversation(store, actor, permissions, params.id, {
      status: parsed.value.status,
      assignee_id: Object.prototype.hasOwnProperty.call(parsed.value, "assignee_id")
        ? parsed.value.assignee_id
        : undefined,
    })
  );
}
