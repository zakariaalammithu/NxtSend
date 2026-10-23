import { NextRequest } from "next/server";
import { listSupportConversations } from "@/lib/support/admin-service";
import { withSupportAdmin } from "@/lib/support/route-helpers";
import type { ConversationListFilters } from "@/lib/support/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/conversations — the Support Inbox list.
 * Filters: status, handling_mode, assignee_id, unassigned=1,
 * waiting=1 (open + human + visitor spoke last), search. The body
 * carries the queue counts (all/open/waiting/assigned/unassigned/
 * resolved) and per-row unread counters + last-message previews.
 * Requires an enabled support agent or a super admin.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters: ConversationListFilters = {};
  const status = params.get("status");
  if (status === "open" || status === "pending" || status === "resolved") {
    filters.status = status;
  }
  const mode = params.get("handling_mode");
  if (mode === "bot" || mode === "human") filters.handling_mode = mode;
  const assignee = params.get("assignee_id");
  if (assignee) filters.assignee_id = assignee;
  if (params.get("unassigned") === "1") filters.unassigned = true;
  if (params.get("waiting") === "1") filters.waiting_for_reply = true;
  const search = params.get("search");
  if (search) filters.search = search;

  return withSupportAdmin(({ store, actor, permissions }) =>
    listSupportConversations(store, actor, permissions, filters)
  );
}
