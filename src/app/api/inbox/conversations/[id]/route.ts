import { NextResponse } from "next/server";
import { resolveInboxContext } from "@/lib/server/inbox";
import { getEmailState } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/conversations/[id]
 *
 * Returns the full thread AND marks it read: the conversation's unread
 * inbound messages get `read_at` set (persisted), so the unread badge
 * and list state are correct on every client afterwards.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    // Mark read first so the returned messages carry fresh read_at.
    await ctx.repo.markConversationRead(ctx.workspaceId, params.id);
    const thread = await ctx.repo.getThread(ctx.workspaceId, params.id);
    if (!thread) {
      return NextResponse.json(
        { error: "Conversation not found in this workspace." },
        { status: 404 }
      );
    }
    const unreadCount = await ctx.repo.getUnreadConversationCount(ctx.workspaceId);
    return NextResponse.json({
      mode: ctx.mode,
      emailState: getEmailState(),
      conversation: thread.conversation,
      messages: thread.messages,
      unreadCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to load conversation: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 500 }
    );
  }
}
