/**
 * Message history flattening — turns the inbox repository's
 * conversation/thread shape into a single chronological message list
 * for the Overview and Usage & History surfaces.
 *
 * Honesty rule baked into the type: every entry carries the message's
 * recorded status verbatim plus a derived `verification` class —
 *   "provider"   the provider confirmed it (a provider message ID is
 *                recorded, or a delivery webhook advanced the status)
 *   "simulated"  Demo Mode simulation — never actually sent
 *   "failed"     the send failed or was blocked (suppressed)
 *   "recorded"   anything else (queued/received/…) — shown as-is
 * Nothing here upgrades a status: a simulated message can never be
 * presented as provider-verified.
 */

import type { InboxMessage, InboxRepository } from "./inbox";

export type MessageVerification = "provider" | "simulated" | "failed" | "recorded";

export interface HistoryMessage extends InboxMessage {
  conversation_subject: string | null;
  contact_name: string;
  contact_email: string;
  company: string | null;
  verification: MessageVerification;
}

export function classifyMessage(msg: {
  status: string;
  direction: string;
  provider_message_id?: string | null;
  is_demo: boolean;
}): MessageVerification {
  if (msg.status === "failed" || msg.status === "suppressed") return "failed";
  if (msg.status === "simulated" || (msg.is_demo && msg.direction === "outbound")) {
    return "simulated";
  }
  if (msg.provider_message_id) return "provider";
  if (msg.status === "delivered") return "provider";
  return "recorded";
}

/** All messages across the workspace's conversations, newest first. */
export async function listMessageHistory(
  repo: InboxRepository,
  workspaceId: string,
  limit = 100
): Promise<HistoryMessage[]> {
  const { conversations } = await repo.listConversations(workspaceId, { limit: 200 });
  const out: HistoryMessage[] = [];
  for (const conv of conversations) {
    const thread = await repo.getThread(workspaceId, conv.id);
    if (!thread) continue;
    for (const msg of thread.messages) {
      out.push({
        ...msg,
        conversation_subject: thread.conversation.subject,
        contact_name: thread.conversation.contact_name,
        contact_email: thread.conversation.contact_email,
        company: thread.conversation.company,
        verification: classifyMessage(msg),
      });
    }
  }
  out.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  return out.slice(0, limit);
}
