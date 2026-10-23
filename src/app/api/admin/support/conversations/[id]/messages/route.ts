import { NextRequest } from "next/server";
import { postSupportAgentMessage } from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/support/conversations/[id]/messages — an agent
 * reply ({ kind: "message" }) or an internal note
 * ({ kind: "internal_note" }; notes are NEVER exposed to visitors).
 * { saved_reply_id } supplies the body from a saved reply — the sent
 * text is snapshotted into the message, so later template edits do
 * not rewrite history. Replying to an unassigned conversation claims
 * it for the replier (event-logged).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    postSupportAgentMessage(store, actor, permissions, params.id, {
      body: parsed.value.body,
      kind: parsed.value.kind,
      savedReplyId: parsed.value.saved_reply_id ?? parsed.value.savedReplyId,
    })
  );
}
