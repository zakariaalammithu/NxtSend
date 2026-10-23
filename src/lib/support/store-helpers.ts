/**
 * Support store — shared pure helpers (P10 Stage E).
 *
 * Both store implementations (Supabase service-role and the in-process
 * demo store) apply IDENTICAL conversation bookkeeping when a message
 * is posted, so the demo behaves exactly like live mode. The rules:
 *
 *  - Unread counters are maintained here, by construction, in the
 *    single write path (routes are the only writers):
 *      visitor/user message -> agent_unread_count + 1
 *      ai/admin/agent reply -> visitor_unread_count + 1
 *      internal notes and system messages touch NO counter.
 *  - last_message_preview follows real messages only (notes/system
 *    messages never become the list preview).
 *  - An agent reply on an open conversation moves it to `pending`
 *    (agent has replied; waiting on the visitor).
 *  - A visitor/user message on a RESOLVED conversation reopens it
 *    (status open, resolution fields cleared) and the caller appends
 *    a `reopened` event.
 */

import { makePreview } from "./validate";
import type {
  ConversationListFilters,
  ConversationQueueCounts,
  SupportConversation,
  SupportMessage,
} from "./types";

export interface MessageEffects {
  patch: Partial<SupportConversation>;
  reopened: boolean;
}

export function computeMessageEffects(
  conversation: SupportConversation,
  message: Pick<SupportMessage, "sender_type" | "kind" | "body">,
  nowIso: string
): MessageEffects {
  const patch: Partial<SupportConversation> = { updated_at: nowIso };
  let reopened = false;

  if (message.kind !== "message") {
    return { patch, reopened };
  }

  patch.last_message_at = nowIso;
  patch.last_message_preview = makePreview(message.body);

  const fromVisitorSide = message.sender_type === "visitor" || message.sender_type === "user";
  if (fromVisitorSide) {
    patch.agent_unread_count = conversation.agent_unread_count + 1;
    patch.last_visitor_message_at = nowIso;
    if (!conversation.first_message_preview) {
      patch.first_message_preview = makePreview(message.body);
    }
    if (!conversation.subject) {
      patch.subject = makePreview(message.body, 200);
    }
    if (conversation.status === "resolved") {
      patch.status = "open";
      patch.resolved_at = null;
      patch.resolved_by = null;
      reopened = true;
    }
  } else {
    // ai / admin / agent
    patch.visitor_unread_count = conversation.visitor_unread_count + 1;
    if (message.sender_type === "admin" || message.sender_type === "agent") {
      patch.last_agent_message_at = nowIso;
      if (conversation.status === "open") {
        patch.status = "pending";
      }
    }
  }

  return { patch, reopened };
}

/** "Waiting for reply": open, human-handled, visitor spoke last. */
export function isWaitingForReply(conversation: SupportConversation): boolean {
  if (conversation.status !== "open" || conversation.handling_mode !== "human") return false;
  if (!conversation.last_visitor_message_at) return false;
  if (!conversation.last_agent_message_at) return true;
  return conversation.last_visitor_message_at > conversation.last_agent_message_at;
}

export function filterConversations(
  rows: SupportConversation[],
  filters: ConversationListFilters
): SupportConversation[] {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.handling_mode && row.handling_mode !== filters.handling_mode) return false;
    if (filters.unassigned && row.assignee_id !== null) return false;
    if (filters.assignee_id && row.assignee_id !== filters.assignee_id) return false;
    if (filters.waiting_for_reply && !isWaitingForReply(row)) return false;
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        row.guest_name ?? "",
        row.guest_email ?? "",
        row.subject ?? "",
        row.last_message_preview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function computeQueueCounts(rows: SupportConversation[]): ConversationQueueCounts {
  return {
    all: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    waiting_for_reply: rows.filter((r) => isWaitingForReply(r)).length,
    assigned: rows.filter((r) => r.assignee_id !== null && r.status !== "resolved").length,
    unassigned: rows.filter((r) => r.assignee_id === null && r.status !== "resolved").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
  };
}
