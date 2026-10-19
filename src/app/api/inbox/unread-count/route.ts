import { NextResponse } from "next/server";
import { resolveInboxContext } from "@/lib/server/inbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/unread-count
 *
 * Conversations with at least one unread inbound message, for the
 * dashboard sidebar badge. Derived from persisted read state
 * (messages.read_at) — the same source the inbox page uses.
 */
export async function GET() {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const count = await ctx.repo.getUnreadConversationCount(ctx.workspaceId);
  return NextResponse.json({ count, mode: ctx.mode });
}
