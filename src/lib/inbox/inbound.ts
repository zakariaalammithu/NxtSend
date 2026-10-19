/**
 * Inbound email ingestion — turns a received email (delivered to us by
 * the Resend `email.received` webhook, content fetched via the Resend
 * Receiving API) into an inbox message in the right conversation.
 *
 * Matching heuristic (documented, in priority order):
 *   1. Threading headers: if In-Reply-To / References contains an ID
 *      that matches a stored message's provider_message_id, the email
 *      joins that message's conversation. (Best-effort: Resend's send
 *      API does not return the RFC Message-ID header it assigns, so
 *      this only fires when the stored ID is the one the sender's
 *      client threaded on.)
 *   2. Same workspace + same contact + same normalized subject
 *      (Re:/Fwd: stripped) -> most recent such conversation.
 *   3. Same contact, any subject -> most recent conversation, but ONLY
 *      when every candidate lives in a single workspace.
 *   4. No conversation, but the sender is a lead in exactly one
 *      workspace -> a new conversation is created there.
 *   5. Otherwise UNROUTED: the event is still recorded (email_events),
 *      but no message is created. We never guess a tenant — dropping a
 *      stranger's email is safer than leaking it into a workspace.
 *
 * Dedupe: the caller dedupes webhook deliveries by svix id; this
 * module additionally refuses to store the same provider message ID
 * twice (backed by the partial unique index in migration 005).
 */

import { extractEmailAddress, normalizeSubject } from "@/lib/data/inbox";

export interface ReceivedEmailContent {
  /** Resend's ID for the received email (data.email_id). */
  providerMessageId: string;
  /** Raw From header value, may be "Name <a@b.c>". */
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  /** RFC Message-ID header of the received email, when provided. */
  messageIdHeader: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string;
}

export function parseAddress(raw: string): { email: string; name: string } {
  const email = extractEmailAddress(raw ?? "");
  const nameMatch = (raw ?? "").match(/^\s*"?([^"<]+)"?\s*</);
  return { email, name: nameMatch ? nameMatch[1].trim() : "" };
}

/** Minimal HTML -> text fallback for providers that send HTML only. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface InboundCandidateConversation {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  contact_email: string;
  subject: string | null;
  last_message_at: string;
}

export interface InboundLeadRef {
  id: string;
  workspace_id: string;
  name: string;
  company: string | null;
}

export interface InboundMatchInput {
  senderEmail: string;
  subject: string | null;
  referenceTarget: { conversationId: string; workspaceId: string } | null;
  /** Email-channel conversations whose contact is the sender, newest first. */
  candidates: InboundCandidateConversation[];
  /** Leads whose email is the sender, across all workspaces. */
  leads: InboundLeadRef[];
}

export type InboundMatch =
  | { kind: "conversation"; conversationId: string; workspaceId: string }
  | { kind: "create"; workspaceId: string; leadId: string }
  | { kind: "unrouted"; reason: string };

export function matchInboundConversation(input: InboundMatchInput): InboundMatch {
  if (input.referenceTarget) {
    return {
      kind: "conversation",
      conversationId: input.referenceTarget.conversationId,
      workspaceId: input.referenceTarget.workspaceId,
    };
  }

  const subject = normalizeSubject(input.subject);
  if (subject) {
    const bySubject = input.candidates.filter(
      (c) => normalizeSubject(c.subject) === subject
    );
    if (bySubject.length > 0) {
      const workspaces = new Set(bySubject.map((c) => c.workspace_id));
      if (workspaces.size === 1) {
        return {
          kind: "conversation",
          conversationId: bySubject[0].id,
          workspaceId: bySubject[0].workspace_id,
        };
      }
      // Same subject+contact in several workspaces: fall through to the
      // ambiguity check below rather than guessing.
    }
  }

  if (input.candidates.length > 0) {
    const workspaces = new Set(input.candidates.map((c) => c.workspace_id));
    if (workspaces.size === 1) {
      return {
        kind: "conversation",
        conversationId: input.candidates[0].id,
        workspaceId: input.candidates[0].workspace_id,
      };
    }
    return {
      kind: "unrouted",
      reason: "Sender matches conversations in multiple workspaces and no subject/thread match could disambiguate.",
    };
  }

  if (input.leads.length > 0) {
    const workspaces = new Set(input.leads.map((l) => l.workspace_id));
    if (workspaces.size === 1) {
      return {
        kind: "create",
        workspaceId: input.leads[0].workspace_id,
        leadId: input.leads[0].id,
      };
    }
    return {
      kind: "unrouted",
      reason: "Sender is a lead in multiple workspaces; cannot choose a tenant safely.",
    };
  }

  return {
    kind: "unrouted",
    reason: "Sender is not a known lead or conversation contact in any workspace.",
  };
}

// ── Ingestion orchestration ─────────────────────────────────────────────────

export interface InboundStore {
  findByProviderMessageId(
    provider: string,
    providerMessageId: string
  ): Promise<{ conversation_id: string } | null>;
  findReferenceTarget(
    tokens: string[]
  ): Promise<{ conversationId: string; workspaceId: string } | null>;
  listCandidateConversations(
    senderEmail: string
  ): Promise<InboundCandidateConversation[]>;
  listLeadsByEmail(email: string): Promise<InboundLeadRef[]>;
  createConversation(input: {
    workspaceId: string;
    leadId: string;
    subject: string | null;
    contactEmail: string;
    contactName: string;
  }): Promise<{ id: string }>;
  insertInboundMessage(input: {
    workspaceId: string;
    conversationId: string;
    leadId: string | null;
    subject: string | null;
    content: string;
    providerMessageId: string;
    sentAt: string;
  }): Promise<{ id: string }>;
  touchConversation(workspaceId: string, conversationId: string, at: string): Promise<void>;
}

export type IngestOutcome =
  | { status: "ingested"; conversationId: string }
  | { status: "duplicate"; conversationId: string | null }
  | { status: "unrouted"; reason: string };

export async function ingestReceivedEmail(
  store: InboundStore,
  email: ReceivedEmailContent
): Promise<IngestOutcome> {
  const existing = await store.findByProviderMessageId("resend", email.providerMessageId);
  if (existing) {
    return { status: "duplicate", conversationId: existing.conversation_id };
  }

  const sender = parseAddress(email.from);
  if (!sender.email) {
    return { status: "unrouted", reason: "Received email has no parseable sender address." };
  }

  const tokens = [email.inReplyTo, ...email.references].filter(
    (t): t is string => Boolean(t)
  );
  const referenceTarget =
    tokens.length > 0 ? await store.findReferenceTarget(tokens) : null;
  const candidates = await store.listCandidateConversations(sender.email);
  const leads =
    candidates.length === 0 && !referenceTarget
      ? await store.listLeadsByEmail(sender.email)
      : [];

  const match = matchInboundConversation({
    senderEmail: sender.email,
    subject: email.subject,
    referenceTarget,
    candidates,
    leads,
  });

  const content =
    (email.text && email.text.trim()) ||
    (email.html ? stripHtml(email.html) : "") ||
    "";

  if (match.kind === "unrouted") {
    return { status: "unrouted", reason: match.reason };
  }

  let conversationId: string;
  let workspaceId: string;
  let leadId: string | null;
  if (match.kind === "create") {
    const lead = leads.find((l) => l.id === match.leadId);
    const created = await store.createConversation({
      workspaceId: match.workspaceId,
      leadId: match.leadId,
      subject: email.subject,
      contactEmail: sender.email,
      contactName: sender.name || lead?.name || sender.email,
    });
    conversationId = created.id;
    workspaceId = match.workspaceId;
    leadId = match.leadId;
  } else {
    conversationId = match.conversationId;
    workspaceId = match.workspaceId;
    leadId = candidates.find((c) => c.id === conversationId)?.lead_id ?? null;
  }

  await store.insertInboundMessage({
    workspaceId,
    conversationId,
    leadId,
    subject: email.subject,
    content,
    providerMessageId: email.providerMessageId,
    sentAt: email.receivedAt,
  });
  await store.touchConversation(workspaceId, conversationId, email.receivedAt);
  return { status: "ingested", conversationId };
}
