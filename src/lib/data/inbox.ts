/**
 * Inbox repository — conversations + messages, one interface, two backends.
 *
 * - Supabase backend (mode "supabase"): queries the `conversations` and
 *   `messages` tables (migration 005) through the caller's client. API
 *   routes pass the SESSION client, so every query is workspace-scoped
 *   here AND tenant-isolated again by RLS. The workspace_id filter is
 *   always applied explicitly as well — a wrong id yields empty results,
 *   never another tenant's threads.
 * - Demo backend (mode "demo"): conversations seeded from the bundled
 *   MOCK_MESSAGES/MOCK_LEADS dataset, persisted through the demo store
 *   (localStorage in the browser, in-process memory on the server) so
 *   replies and read state behave like a real product. The seed — and
 *   everything the demo backend returns — is demo data and is labelled
 *   as such in the UI (`is_demo`).
 *
 * Read model: a message is UNREAD when it is inbound and `read_at` is
 * null. Opening a thread marks its inbound messages read; the count is
 * always derived from that stored state, never from message status
 * (the old mock derived "unread" from status 'replied', which was
 * semantically inverted).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { MOCK_LEADS, MOCK_MESSAGES } from "@/lib/db/mock/data";
import { generateId } from "@/lib/utils";
import type { MessageChannel, MessageDirection } from "@/types";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";

// ── Types ───────────────────────────────────────────────────────────────────

export interface InboxMessage {
  id: string;
  workspace_id: string;
  conversation_id: string;
  lead_id: string | null;
  campaign_id?: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  subject?: string | null;
  content: string;
  /** Provider/delivery state: queued | sent | delivered | simulated |
   *  failed | suppressed | received | … — never fabricated. */
  status: string;
  is_demo: boolean;
  sent_at: string;
  read_at: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  idempotency_key?: string | null;
  error?: string | null;
  /**
   * Voice note carried by this message (P6 Stage C, migration 015).
   * `voice_note_path` is either a private-bucket storage path
   * (`<workspace_id>/<note_id>/<file>`, live mode — played through
   * the signed-URL route) or a `data:` URL (Demo Mode — the audio
   * never left the browser). Null when the message has no voice note.
   */
  voice_note_path?: string | null;
  voice_note_duration_sec?: number | null;
  voice_note_language?: string | null;
  /** Transcript of the voice note when one was produced. */
  transcript?: string | null;
}

export interface InboxConversation {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  channel: MessageChannel;
  subject: string | null;
  contact_name: string;
  contact_email: string;
  company: string | null;
  status: "open" | "archived";
  assignee_id: string | null;
  is_demo: boolean;
  last_message_at: string;
  created_at: string;
}

export interface ConversationSummary extends InboxConversation {
  last_message_preview: string;
  last_message_direction: MessageDirection | null;
  unread_count: number;
  unread: boolean;
}

export interface ListConversationsOptions {
  search?: string;
  channel?: MessageChannel;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface InsertMessageInput {
  workspace_id: string;
  conversation_id: string;
  lead_id: string | null;
  /** Campaign that produced this message (sequence executor sends). */
  campaign_id?: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  subject?: string | null;
  content: string;
  status: string;
  is_demo: boolean;
  provider?: string | null;
  provider_message_id?: string | null;
  idempotency_key?: string | null;
  error?: string | null;
  sent_at?: string;
  read_at?: string | null;
  /** Voice-note fields (P6 Stage C) — see InboxMessage. */
  voice_note_path?: string | null;
  voice_note_duration_sec?: number | null;
  voice_note_language?: string | null;
  transcript?: string | null;
}

export interface InboxRepository {
  readonly mode: DataMode;
  listConversations(
    workspaceId: string,
    opts?: ListConversationsOptions
  ): Promise<{ conversations: ConversationSummary[]; total: number }>;
  getThread(
    workspaceId: string,
    conversationId: string
  ): Promise<{ conversation: InboxConversation; messages: InboxMessage[] } | null>;
  /** Sets read_at on the thread's unread inbound messages. Returns how many were marked. */
  markConversationRead(workspaceId: string, conversationId: string): Promise<number>;
  /** Number of conversations with at least one unread inbound message. */
  getUnreadConversationCount(workspaceId: string): Promise<number>;
  findMessageByIdempotencyKey(
    workspaceId: string,
    conversationId: string,
    key: string
  ): Promise<InboxMessage | null>;
  /**
   * Returns the id of the workspace's OPEN conversation for
   * (lead, channel), creating it when none exists. Used by the
   * sequence executor so campaign sends land in the same thread model
   * as inbox replies instead of floating outside conversations.
   */
  findOrCreateConversation(
    workspaceId: string,
    input: {
      lead_id: string | null;
      channel: MessageChannel;
      contact_name: string;
      contact_email: string;
      subject: string | null;
      is_demo: boolean;
    }
  ): Promise<string>;
  insertMessage(input: InsertMessageInput): Promise<InboxMessage>;
  updateMessage(
    workspaceId: string,
    id: string,
    patch: Partial<InboxMessage>
  ): Promise<InboxMessage>;
  touchConversation(workspaceId: string, conversationId: string, at: string): Promise<void>;
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** A message is unread iff it is inbound and has no read marker. */
export function isUnreadMessage(m: Pick<InboxMessage, "direction" | "read_at">): boolean {
  return m.direction === "inbound" && !m.read_at;
}

export function deriveUnreadCount(messages: InboxMessage[]): number {
  return messages.filter(isUnreadMessage).length;
}

export function summarizeConversation(
  conversation: InboxConversation,
  messages: InboxMessage[]
): ConversationSummary {
  const sorted = [...messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const last = sorted[sorted.length - 1];
  const unreadCount = deriveUnreadCount(sorted);
  return {
    ...conversation,
    last_message_preview: last ? last.content : "",
    last_message_direction: last ? last.direction : null,
    unread_count: unreadCount,
    unread: unreadCount > 0,
  };
}

export function buildConversationSummaries(
  conversations: InboxConversation[],
  messages: InboxMessage[]
): ConversationSummary[] {
  const byConversation = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const arr = byConversation.get(m.conversation_id) ?? [];
    arr.push(m);
    byConversation.set(m.conversation_id, arr);
  }
  return conversations
    .map((c) => summarizeConversation(c, byConversation.get(c.id) ?? []))
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

/** "Re: Re: Fwd: Hello " -> "hello" — for thread-subject matching. */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = subject.trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(re|fwd|fw)\s*:\s*/i, "").trim();
  }
  return s.toLowerCase();
}

/** Subject for an outgoing reply: keeps the thread subject, Re:-prefixed once. */
export function deriveReplySubject(conversation: InboxConversation): string {
  const base = (conversation.subject ?? "").trim();
  if (!base) return "Re: your message";
  return /^re\s*:/i.test(base) ? base : `Re: ${base}`;
}

/** Extracts the bare address from "Name <a@b.c>" or returns the trimmed input. */
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// Demo backend
// ============================================================================

const DEMO_CONVERSATIONS_KEY = "nxtsend_demo_conversations_v1";
const DEMO_INBOX_MESSAGES_KEY = "nxtsend_demo_inbox_messages_v1";

interface DemoSeed {
  conversations: InboxConversation[];
  messages: InboxMessage[];
}

/** Groups the bundled mock messages into (lead, channel) conversations. */
export function seedDemoInbox(): DemoSeed {
  const conversations: InboxConversation[] = [];
  const messages: InboxMessage[] = [];
  const byKey = new Map<string, InboxConversation>();

  const sorted = [...MOCK_MESSAGES].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  for (const m of sorted) {
    const key = `${m.lead_id}:${m.channel}`;
    let conv = byKey.get(key);
    if (!conv) {
      const lead = MOCK_LEADS.find((l) => l.id === m.lead_id);
      conv = {
        id: `conv_demo_${String(byKey.size + 1).padStart(3, "0")}`,
        workspace_id: m.workspace_id,
        lead_id: m.lead_id,
        channel: m.channel,
        subject: null,
        contact_name: lead
          ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Prospect"
          : "Prospect",
        contact_email: lead?.email ?? "",
        company: lead?.company ?? null,
        status: "open",
        assignee_id: null,
        is_demo: true,
        last_message_at: m.sent_at,
        created_at: m.sent_at,
      };
      byKey.set(key, conv);
      conversations.push(conv);
    }
    if (m.subject && !conv.subject) conv.subject = m.subject;
    conv.last_message_at = m.sent_at;
    messages.push({
      id: m.id,
      workspace_id: m.workspace_id,
      conversation_id: conv.id,
      lead_id: m.lead_id,
      campaign_id: m.campaign_id ?? null,
      channel: m.channel,
      direction: m.direction,
      subject: m.subject ?? null,
      content: m.content,
      status: m.status,
      is_demo: true,
      sent_at: m.sent_at,
      read_at: null,
      provider: null,
      provider_message_id: null,
      idempotency_key: null,
      error: null,
    });
  }
  return { conversations, messages };
}

class DemoInboxRepository implements InboxRepository {
  readonly mode: DataMode = "demo";

  private loadConversations(): InboxConversation[] {
    return loadDemoCollection<InboxConversation>(DEMO_CONVERSATIONS_KEY, () => {
      const seed = seedDemoInbox();
      saveDemoCollection(DEMO_INBOX_MESSAGES_KEY, seed.messages);
      return seed.conversations;
    });
  }

  private loadMessages(): InboxMessage[] {
    return loadDemoCollection<InboxMessage>(DEMO_INBOX_MESSAGES_KEY, () => {
      const seed = seedDemoInbox();
      saveDemoCollection(DEMO_CONVERSATIONS_KEY, seed.conversations);
      return seed.messages;
    });
  }

  private saveConversations(items: InboxConversation[]): void {
    saveDemoCollection(DEMO_CONVERSATIONS_KEY, items);
  }

  private saveMessages(items: InboxMessage[]): void {
    saveDemoCollection(DEMO_INBOX_MESSAGES_KEY, items);
  }

  async listConversations(workspaceId: string, opts: ListConversationsOptions = {}) {
    const allMessages = this.loadMessages().filter((m) => m.workspace_id === workspaceId);
    let convs = this.loadConversations().filter((c) => c.workspace_id === workspaceId);
    if (opts.channel) convs = convs.filter((c) => c.channel === opts.channel);
    let summaries = buildConversationSummaries(convs, allMessages);
    if (opts.unreadOnly) summaries = summaries.filter((s) => s.unread);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      summaries = summaries.filter(
        (s) =>
          s.contact_name.toLowerCase().includes(q) ||
          s.contact_email.toLowerCase().includes(q) ||
          (s.company ?? "").toLowerCase().includes(q) ||
          (s.subject ?? "").toLowerCase().includes(q) ||
          s.last_message_preview.toLowerCase().includes(q)
      );
    }
    const total = summaries.length;
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? total;
    return { conversations: summaries.slice(offset, offset + limit), total };
  }

  async getThread(workspaceId: string, conversationId: string) {
    const conversation = this.loadConversations().find(
      (c) => c.id === conversationId && c.workspace_id === workspaceId
    );
    if (!conversation) return null;
    const messages = this.loadMessages()
      .filter((m) => m.conversation_id === conversationId && m.workspace_id === workspaceId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    return { conversation, messages };
  }

  async markConversationRead(workspaceId: string, conversationId: string) {
    const messages = this.loadMessages();
    let marked = 0;
    const now = new Date().toISOString();
    for (const m of messages) {
      if (
        m.workspace_id === workspaceId &&
        m.conversation_id === conversationId &&
        isUnreadMessage(m)
      ) {
        m.read_at = now;
        marked++;
      }
    }
    if (marked > 0) this.saveMessages(messages);
    return marked;
  }

  async getUnreadConversationCount(workspaceId: string) {
    const unreadThreads = new Set(
      this.loadMessages()
        .filter((m) => m.workspace_id === workspaceId && isUnreadMessage(m))
        .map((m) => m.conversation_id)
    );
    return unreadThreads.size;
  }

  async findMessageByIdempotencyKey(
    workspaceId: string,
    conversationId: string,
    key: string
  ) {
    return (
      this.loadMessages().find(
        (m) =>
          m.workspace_id === workspaceId &&
          m.conversation_id === conversationId &&
          m.idempotency_key === key
      ) ?? null
    );
  }

  async findOrCreateConversation(
    workspaceId: string,
    input: {
      lead_id: string | null;
      channel: MessageChannel;
      contact_name: string;
      contact_email: string;
      subject: string | null;
      is_demo: boolean;
    }
  ) {
    const conversations = this.loadConversations();
    const existing = conversations.find(
      (c) =>
        c.workspace_id === workspaceId &&
        c.lead_id === input.lead_id &&
        c.channel === input.channel &&
        c.status === "open"
    );
    if (existing) return existing.id;
    const now = new Date().toISOString();
    const lead = input.lead_id
      ? MOCK_LEADS.find((l) => l.id === input.lead_id)
      : undefined;
    const conv: InboxConversation = {
      id: `conv_demo_${generateId()}`,
      workspace_id: workspaceId,
      lead_id: input.lead_id,
      channel: input.channel,
      subject: input.subject,
      contact_name: input.contact_name,
      contact_email: input.contact_email,
      company: lead?.company ?? null,
      status: "open",
      assignee_id: null,
      is_demo: true,
      last_message_at: now,
      created_at: now,
    };
    conversations.push(conv);
    this.saveConversations(conversations);
    return conv.id;
  }

  async insertMessage(input: InsertMessageInput) {
    const message: InboxMessage = {
      id: `msg_demo_${generateId()}`,
      campaign_id: null,
      provider: null,
      provider_message_id: null,
      idempotency_key: null,
      error: null,
      read_at: null,
      subject: null,
      sent_at: new Date().toISOString(),
      ...input,
    };
    const messages = this.loadMessages();
    messages.push(message);
    this.saveMessages(messages);
    return message;
  }

  async updateMessage(workspaceId: string, id: string, patch: Partial<InboxMessage>) {
    const messages = this.loadMessages();
    const idx = messages.findIndex((m) => m.id === id && m.workspace_id === workspaceId);
    if (idx < 0) throw new Error(`Inbox message not found: ${id}`);
    const updated = { ...messages[idx], ...patch, id: messages[idx].id };
    messages[idx] = updated;
    this.saveMessages(messages);
    return updated;
  }

  async touchConversation(workspaceId: string, conversationId: string, at: string) {
    const conversations = this.loadConversations();
    const conv = conversations.find(
      (c) => c.id === conversationId && c.workspace_id === workspaceId
    );
    if (conv) {
      conv.last_message_at = at;
      this.saveConversations(conversations);
    }
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type MessageRow = Record<string, unknown>;

function rowToMessage(row: MessageRow): InboxMessage {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    conversation_id: String(row.conversation_id),
    lead_id: (row.lead_id as string | null) ?? null,
    campaign_id: (row.campaign_id as string | null) ?? null,
    channel: row.channel as MessageChannel,
    direction: row.direction as MessageDirection,
    subject: (row.subject as string | null) ?? null,
    content: String(row.content ?? ""),
    status: String(row.status ?? ""),
    is_demo: Boolean(row.is_demo),
    sent_at: String(row.sent_at),
    read_at: (row.read_at as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    idempotency_key: (row.idempotency_key as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    voice_note_path: (row.voice_note_path as string | null) ?? null,
    voice_note_duration_sec:
      typeof row.voice_note_duration_sec === "number"
        ? row.voice_note_duration_sec
        : null,
    voice_note_language: (row.voice_note_language as string | null) ?? null,
    transcript: (row.transcript as string | null) ?? null,
  };
}

function rowToConversation(row: MessageRow, company: string | null): InboxConversation {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    lead_id: (row.lead_id as string | null) ?? null,
    channel: row.channel as MessageChannel,
    subject: (row.subject as string | null) ?? null,
    contact_name: String(row.contact_name ?? ""),
    contact_email: String(row.contact_email ?? ""),
    company,
    status: (row.status as "open" | "archived") ?? "open",
    assignee_id: (row.assignee_id as string | null) ?? null,
    is_demo: Boolean(row.is_demo),
    last_message_at: String(row.last_message_at),
    created_at: String(row.created_at),
  };
}

class SupabaseInboxRepository implements InboxRepository {
  readonly mode: DataMode = "supabase";
  private readonly clientFactory: () => SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.clientFactory = client ? () => client : () => createClient();
  }

  private client(): SupabaseClient {
    const c = this.clientFactory();
    if (!c) throw new Error("Supabase client is not configured");
    return c;
  }

  /** Company names live on leads; resolve them for display only. */
  private async companyByLead(
    supabase: SupabaseClient,
    leadIds: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const ids = Array.from(new Set(leadIds.filter((x): x is string => Boolean(x))));
    const map = new Map<string, string | null>();
    if (ids.length === 0) return map;
    const { data } = await supabase.from("leads").select("id, company").in("id", ids);
    for (const row of (data ?? []) as MessageRow[]) {
      map.set(String(row.id), (row.company as string | null) ?? null);
    }
    return map;
  }

  async listConversations(workspaceId: string, opts: ListConversationsOptions = {}) {
    const supabase = this.client();

    let restrictIds: string[] | null = null;
    if (opts.unreadOnly) {
      const { data: unreadRows } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("workspace_id", workspaceId)
        .eq("direction", "inbound")
        .is("read_at", null)
        .not("conversation_id", "is", null);
      restrictIds = Array.from(
        new Set(((unreadRows ?? []) as MessageRow[]).map((r) => String(r.conversation_id)))
      );
      if (restrictIds.length === 0) return { conversations: [], total: 0 };
    }

    let query = supabase
      .from("conversations")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false });
    if (opts.channel) query = query.eq("channel", opts.channel);
    if (restrictIds) query = query.in("id", restrictIds);
    if (opts.search) {
      const q = `%${opts.search.replace(/[%_]/g, "")}%`;
      query = query.or(
        `subject.ilike.${q},contact_email.ilike.${q},contact_name.ilike.${q}`
      );
    }
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    const rows = (data ?? []) as MessageRow[];
    const companies = await this.companyByLead(
      supabase,
      rows.map((r) => (r.lead_id as string | null) ?? null)
    );
    const conversations = rows.map((r) =>
      rowToConversation(r, r.lead_id ? companies.get(String(r.lead_id)) ?? null : null)
    );
    if (conversations.length === 0) return { conversations: [], total: count ?? 0 };

    const { data: msgRows } = await supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in(
        "conversation_id",
        conversations.map((c) => c.id)
      )
      .order("sent_at", { ascending: true });
    const messages = ((msgRows ?? []) as MessageRow[]).map(rowToMessage);

    let summaries = buildConversationSummaries(conversations, messages);
    if (opts.search) {
      // contact fields were filtered in SQL; also allow preview matches.
      const q = opts.search.toLowerCase();
      summaries = summaries.filter(
        (s) =>
          s.contact_name.toLowerCase().includes(q) ||
          s.contact_email.toLowerCase().includes(q) ||
          (s.company ?? "").toLowerCase().includes(q) ||
          (s.subject ?? "").toLowerCase().includes(q) ||
          s.last_message_preview.toLowerCase().includes(q)
      );
    }
    return { conversations: summaries, total: count ?? summaries.length };
  }

  async getThread(workspaceId: string, conversationId: string) {
    const supabase = this.client();
    const { data: convRow } = await supabase
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .maybeSingle();
    if (!convRow) return null;
    const conversation = rowToConversation(
      convRow as MessageRow,
      null
    );
    if (conversation.lead_id) {
      const companies = await this.companyByLead(supabase, [conversation.lead_id]);
      conversation.company = companies.get(conversation.lead_id) ?? null;
    }
    const { data: msgRows } = await supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true });
    return {
      conversation,
      messages: ((msgRows ?? []) as MessageRow[]).map(rowToMessage),
    };
  }

  async markConversationRead(workspaceId: string, conversationId: string) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .is("read_at", null)
      .select("id");
    if (error) throw new Error(`Failed to mark conversation read: ${error.message}`);
    return (data ?? []).length;
  }

  async getUnreadConversationCount(workspaceId: string) {
    const supabase = this.client();
    const { data } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .is("read_at", null)
      .not("conversation_id", "is", null);
    return new Set(((data ?? []) as MessageRow[]).map((r) => String(r.conversation_id)))
      .size;
  }

  async findMessageByIdempotencyKey(
    workspaceId: string,
    conversationId: string,
    key: string
  ) {
    const supabase = this.client();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .eq("idempotency_key", key)
      .maybeSingle();
    return data ? rowToMessage(data as MessageRow) : null;
  }

  async findOrCreateConversation(
    workspaceId: string,
    input: {
      lead_id: string | null;
      channel: MessageChannel;
      contact_name: string;
      contact_email: string;
      subject: string | null;
      is_demo: boolean;
    }
  ) {
    const supabase = this.client();
    if (input.lead_id) {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("lead_id", input.lead_id)
        .eq("channel", input.channel)
        .eq("status", "open")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return String((data as { id: string }).id);
    }
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        lead_id: input.lead_id,
        channel: input.channel,
        subject: input.subject,
        contact_email: input.contact_email,
        contact_name: input.contact_name,
        status: "open",
        is_demo: input.is_demo,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create conversation: ${error?.message ?? "no row"}`);
    }
    return String((data as { id: string }).id);
  }

  async insertMessage(input: InsertMessageInput) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: input.workspace_id,
        conversation_id: input.conversation_id,
        lead_id: input.lead_id,
        campaign_id: input.campaign_id ?? null,
        channel: input.channel,
        direction: input.direction,
        subject: input.subject ?? null,
        content: input.content,
        status: input.status,
        is_demo: input.is_demo,
        provider: input.provider ?? null,
        provider_message_id: input.provider_message_id ?? null,
        idempotency_key: input.idempotency_key ?? null,
        error: input.error ?? null,
        ...(input.sent_at ? { sent_at: input.sent_at } : {}),
        ...(input.read_at ? { read_at: input.read_at } : {}),
        // Voice columns (migration 015) are only written when a
        // voice note is present, so plain text sends keep working
        // against a database that has not applied 015 yet.
        ...(input.voice_note_path
          ? {
              voice_note_path: input.voice_note_path,
              voice_note_duration_sec: input.voice_note_duration_sec ?? null,
              voice_note_language: input.voice_note_language ?? null,
              transcript: input.transcript ?? null,
            }
          : {}),
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to insert inbox message: ${error.message}`);
    return rowToMessage(data as MessageRow);
  }

  async updateMessage(workspaceId: string, id: string, patch: Partial<InboxMessage>) {
    const supabase = this.client();
    const allowed: MessageRow = {};
    for (const key of [
      "status",
      "content",
      "subject",
      "error",
      "provider",
      "provider_message_id",
      "read_at",
      "sent_at",
      "voice_note_path",
      "voice_note_duration_sec",
      "voice_note_language",
      "transcript",
    ] as const) {
      if (patch[key] !== undefined) allowed[key] = patch[key] as unknown;
    }
    const { data, error } = await supabase
      .from("messages")
      .update(allowed)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update inbox message: ${error.message}`);
    return rowToMessage(data as MessageRow);
  }

  async touchConversation(workspaceId: string, conversationId: string, at: string) {
    const supabase = this.client();
    await supabase
      .from("conversations")
      .update({ last_message_at: at, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createInboxRepository(
  mode: DataMode = getDataMode(),
  client?: SupabaseClient | null
): InboxRepository {
  return mode === "supabase"
    ? new SupabaseInboxRepository(client)
    : new DemoInboxRepository();
}
