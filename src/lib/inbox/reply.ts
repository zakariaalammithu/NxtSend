/**
 * Inbox reply service — the one real send path behind
 * POST /api/inbox/conversations/[id]/reply.
 *
 * Guarantees (brief §6):
 *  - The recipient and body are validated server-side; the recipient is
 *    always the conversation's contact, never client-supplied.
 *  - A message row is created BEFORE the provider call, keyed by the
 *    client's idempotency key. Retrying with the same key re-uses that
 *    row: a reply that already reached a terminal state (sent /
 *    simulated) is returned as-is and never sent twice; a failed attempt
 *    is re-sent by updating the same row.
 *  - The row's final status is exactly the email adapter's outcome:
 *    `sent` only with a provider message ID, `simulated` in demo mode
 *    (labelled, never "delivered"), `suppressed` when the workspace
 *    suppression list refuses the recipient (the adapter enforces the
 *    check before any provider call and fails closed), `failed` with
 *    the provider's error text otherwise.
 *  - LinkedIn conversations can never be sent from here: no authorized
 *    LinkedIn provider exists, so the service refuses before touching
 *    the adapter or the database.
 *
 * The service is storage/provider-agnostic (repository + adapter are
 * injected) so the whole flow is unit-testable with fakes.
 */

import type { EmailProviderAdapter, SendEmailResult } from "@/lib/email/types";
import { getEmailReplyTo } from "@/lib/email/state";
import {
  deriveReplySubject,
  isValidEmailAddress,
  type InboxMessage,
  type InboxRepository,
} from "@/lib/data/inbox";

export type ReplyFailureCode =
  | "not_found"
  | "empty_content"
  | "missing_idempotency_key"
  | "invalid_recipient"
  | "linkedin_unavailable"
  | "suppressed"
  | "not_configured"
  | "provider_error";

export type ReplyOutcome =
  | {
      ok: true;
      duplicate: boolean;
      message: InboxMessage;
      providerResult: SendEmailResult | null;
    }
  | {
      ok: false;
      code: ReplyFailureCode;
      error: string;
      /** The persisted attempt row, when one exists (failed/suppressed). */
      message: InboxMessage | null;
      providerResult: SendEmailResult | null;
    };

export interface SendReplyArgs {
  workspaceId: string;
  conversationId: string;
  content: string;
  subject?: string;
  idempotencyKey: string;
}

const TERMINAL_OK = new Set(["sent", "simulated"]);

export async function sendInboxReply(
  deps: { repo: InboxRepository; adapter: EmailProviderAdapter },
  args: SendReplyArgs
): Promise<ReplyOutcome> {
  const { repo, adapter } = deps;
  const content = (args.content ?? "").trim();

  if (!args.idempotencyKey || !args.idempotencyKey.trim()) {
    return {
      ok: false,
      code: "missing_idempotency_key",
      error: "An idempotency key is required so a retry can never send a reply twice.",
      message: null,
      providerResult: null,
    };
  }
  if (!content) {
    return {
      ok: false,
      code: "empty_content",
      error: "Reply content must not be empty.",
      message: null,
      providerResult: null,
    };
  }

  const thread = await repo.getThread(args.workspaceId, args.conversationId);
  if (!thread) {
    return {
      ok: false,
      code: "not_found",
      error: "Conversation not found in this workspace.",
      message: null,
      providerResult: null,
    };
  }
  const { conversation } = thread;

  if (conversation.channel === "linkedin") {
    // PROVIDER SEAM (P5 Stage F): LinkedIn replies dispatch through
    // LinkedInProviderAdapter.sendMessage (src/lib/linkedin) once an
    // approved provider adapter is configured and reports state
    // "connected". Until then — the NotConfigured implementation is
    // the only one — the refusal below stands and the API route maps
    // it to HTTP 422. Behavior is unchanged by the seam.
    return {
      ok: false,
      code: "linkedin_unavailable",
      error:
        "LinkedIn replies require an authorized LinkedIn integration. None is connected, so this reply was not sent.",
      message: null,
      providerResult: null,
    };
  }

  const recipient = (conversation.contact_email ?? "").trim().toLowerCase();
  if (!isValidEmailAddress(recipient)) {
    return {
      ok: false,
      code: "invalid_recipient",
      error: `The conversation contact has no valid email address (got "${conversation.contact_email || "empty"}"). Reply was not sent.`,
      message: null,
      providerResult: null,
    };
  }

  const subject =
    (args.subject ?? "").trim() || deriveReplySubject(conversation);
  const isDemo = repo.mode === "demo";

  // Idempotency: an existing attempt row decides what happens next.
  let attempt = await repo.findMessageByIdempotencyKey(
    args.workspaceId,
    args.conversationId,
    args.idempotencyKey
  );
  if (attempt && TERMINAL_OK.has(attempt.status)) {
    return { ok: true, duplicate: true, message: attempt, providerResult: null };
  }
  if (!attempt) {
    attempt = await repo.insertMessage({
      workspace_id: args.workspaceId,
      conversation_id: args.conversationId,
      lead_id: conversation.lead_id,
      channel: "email",
      direction: "outbound",
      subject,
      content,
      status: "queued",
      is_demo: isDemo,
      idempotency_key: args.idempotencyKey,
    });
  } else {
    // Retry of a failed/suppressed/queued attempt: same row, fresh try.
    attempt = await repo.updateMessage(args.workspaceId, attempt.id, {
      status: "queued",
      error: null,
      content,
      subject,
    });
  }

  const result = await adapter.sendEmail({
    workspaceId: args.workspaceId,
    to: recipient,
    subject,
    text: content,
    // Reply routing (P5 Stage C): EMAIL_REPLY_TO when set, so a reply
    // to this reply also lands on the receiving domain / Inbox.
    replyTo: getEmailReplyTo(),
    leadId: conversation.lead_id,
  });

  const now = new Date().toISOString();
  let updated: InboxMessage;
  switch (result.status) {
    case "sent":
      updated = await repo.updateMessage(args.workspaceId, attempt.id, {
        status: "sent",
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        error: null,
        sent_at: now,
      });
      await repo.touchConversation(args.workspaceId, args.conversationId, now);
      return { ok: true, duplicate: false, message: updated, providerResult: result };
    case "simulated":
      updated = await repo.updateMessage(args.workspaceId, attempt.id, {
        status: "simulated",
        provider: result.provider,
        provider_message_id: null,
        error: null,
        sent_at: now,
      });
      await repo.touchConversation(args.workspaceId, args.conversationId, now);
      return { ok: true, duplicate: false, message: updated, providerResult: result };
    case "suppressed":
      updated = await repo.updateMessage(args.workspaceId, attempt.id, {
        status: "suppressed",
        provider: result.provider,
        error: result.message,
      });
      return {
        ok: false,
        code: "suppressed",
        error: result.message,
        message: updated,
        providerResult: result,
      };
    case "not_configured":
      updated = await repo.updateMessage(args.workspaceId, attempt.id, {
        status: "failed",
        provider: result.provider,
        error: result.message,
      });
      return {
        ok: false,
        code: "not_configured",
        error: result.message,
        message: updated,
        providerResult: result,
      };
    default:
      updated = await repo.updateMessage(args.workspaceId, attempt.id, {
        status: "failed",
        provider: result.provider,
        error: result.message,
      });
      return {
        ok: false,
        code: "provider_error",
        error: result.message,
        message: updated,
        providerResult: result,
      };
  }
}
