import { NextResponse } from "next/server";
import { resolveInboxContext } from "@/lib/server/inbox";
import { getEmailState } from "@/lib/email";
import type { MessageChannel } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/conversations?search=&channel=&unread=&limit=&offset=
 *
 * Lists the signed-in workspace's conversations (newest activity
 * first), each with its derived unread count. Session-required in
 * Supabase mode; serves the labelled demo workspace in Demo Mode.
 */
export async function GET(req: Request) {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const channelParam = url.searchParams.get("channel");
  const channel: MessageChannel | undefined =
    channelParam === "email" || channelParam === "linkedin"
      ? channelParam
      : undefined;
  const unreadOnly =
    url.searchParams.get("unread") === "1" || channelParam === "unread";
  const search = url.searchParams.get("search") ?? undefined;

  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
    : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;

  try {
    const { conversations, total } = await ctx.repo.listConversations(
      ctx.workspaceId,
      { search, channel, unreadOnly, limit, offset }
    );
    const unreadCount = await ctx.repo.getUnreadConversationCount(ctx.workspaceId);
    return NextResponse.json({
      mode: ctx.mode,
      emailState: getEmailState(),
      conversations,
      total,
      unreadCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to load conversations: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 500 }
    );
  }
}
