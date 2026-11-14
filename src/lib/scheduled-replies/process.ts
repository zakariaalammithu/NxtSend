/**
 * Due scheduled-reply processing — the worker side of scheduled
 * replies (migration 022).
 *
 * `processDueScheduledReplies` is storage/transport-agnostic (the
 * caller injects listDue / mark / sender) so the whole flow is
 * unit-testable with fakes. `processDueScheduledRepliesLive` wires it
 * to the real backends: the Supabase `scheduled_replies` table via the
 * service-role client, and the existing `sendInboxReply` path
 * (src/lib/inbox/reply.ts) through the per-conversation routing
 * adapter, exactly like POST /api/inbox/conversations/[id]/reply.
 *
 * Guarantees:
 * - A due row is sent at most once per run: the idempotency key is
 *   derived from the row id (`scheduled_<id>`), so a retried worker
 *   run re-uses the same reply attempt row and can never double-send.
 * - The row's final status is the send outcome: `sent` only when the
 *   reply path reports success, `simulated` when the adapter
 *   simulated it, `failed` on any refusal or provider error
 *   (including LinkedIn conversations, which the reply path refuses,
 *   and unconfigured email, which fails closed).
 * - Demo Mode has no server-side rows: demo scheduled replies live
 *   in the browser demo store, so the Inbox page marks due demo rows
 *   `simulated` when it loads them — never actually sent. This module
 *   never touches demo data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createInboxRepository } from "@/lib/data/inbox";
import {
  createScheduledRepliesRepository,
  type ScheduledReply,
  type ScheduledReplyStatus,
} from "@/lib/data/scheduled-replies";
import { createConversationRoutingAdapter } from "@/lib/email";
import { sendInboxReply } from "@/lib/inbox/reply";

export interface DueReplySender {
  send(args: {
    workspaceId: string;
    conversationId: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; simulated: boolean; error?: string }>;
}

export interface ProcessDueScheduledRepliesDeps {
  listDue(nowIso: string): Promise<ScheduledReply[]>;
  mark(id: string, status: ScheduledReplyStatus): Promise<unknown>;
  sender: DueReplySender;
  now?: Date;
}

export interface ProcessDueScheduledRepliesSummary {
  checked: number;
  sent: number;
  simulated: number;
  failed: number;
}

export async function processDueScheduledReplies(
  deps: ProcessDueScheduledRepliesDeps
): Promise<ProcessDueScheduledRepliesSummary> {
  const now = deps.now ?? new Date();
  const due = await deps.listDue(now.toISOString());
  const summary: ProcessDueScheduledRepliesSummary = {
    checked: due.length,
    sent: 0,
    simulated: 0,
    failed: 0,
  };
  for (const row of due) {
    try {
      const result = await deps.sender.send({
        workspaceId: row.workspace_id,
        conversationId: row.conversation_id,
        body: row.body,
        idempotencyKey: `scheduled_${row.id}`,
      });
      if (result.ok && result.simulated) {
        await deps.mark(row.id, "simulated");
        summary.simulated++;
      } else if (result.ok) {
        await deps.mark(row.id, "sent");
        summary.sent++;
      } else {
        await deps.mark(row.id, "failed");
        summary.failed++;
      }
    } catch {
      // A throw (adapter/store) is a failed send, never a lost row:
      // mark it failed so the next run does not silently retry it
      // forever, and keep processing the remaining due rows.
      try {
        await deps.mark(row.id, "failed");
      } catch {
        // The mark itself failed — the row stays scheduled and will
        // be retried on the next run; still counted as failed here.
      }
      summary.failed++;
    }
  }
  return summary;
}

/**
 * Live wiring for the worker routes (POST /api/jobs/run hook and
 * POST /api/cron/scheduled-replies). Requires the service-role admin
 * client: it reads due rows across workspaces and sends through the
 * reply path with the workspace's routing adapter.
 */
export async function processDueScheduledRepliesLive(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<ProcessDueScheduledRepliesSummary> {
  const repo = createScheduledRepliesRepository("supabase", admin);
  const sender: DueReplySender = {
    async send({ workspaceId, conversationId, body, idempotencyKey }) {
      const inboxRepo = createInboxRepository("supabase", admin);
      const adapter = createConversationRoutingAdapter(admin, conversationId);
      const outcome = await sendInboxReply(
        { repo: inboxRepo, adapter },
        { workspaceId, conversationId, content: body, idempotencyKey }
      );
      if (outcome.ok) {
        return { ok: true, simulated: outcome.message.status === "simulated" };
      }
      return { ok: false, simulated: false, error: outcome.error };
    },
  };
  return processDueScheduledReplies({
    listDue: (nowIso) => repo.listDue(nowIso),
    mark: (id, status) => repo.markStatus(id, status),
    sender,
    now,
  });
}
