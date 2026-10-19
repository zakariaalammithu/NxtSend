import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createInboxRepository,
  deriveUnreadCount,
  isUnreadMessage,
  normalizeSubject,
  deriveReplySubject,
  summarizeConversation,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/data/inbox";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

// ── Pure helpers ────────────────────────────────────────────────────────────

describe("inbox pure helpers", () => {
  it("derives unread from read_at, never from status", () => {
    const base = {
      id: "m1",
      workspace_id: "ws",
      conversation_id: "c1",
      lead_id: null,
      channel: "email" as const,
      content: "hi",
      status: "replied", // the OLD mock treated this status as "unread"
      is_demo: true,
      sent_at: "2024-10-09T00:00:00.000Z",
    };
    const unreadMsg: InboxMessage = { ...base, direction: "inbound", read_at: null };
    const readMsg: InboxMessage = {
      ...base,
      direction: "inbound",
      read_at: "2024-10-09T01:00:00.000Z",
    };
    const outbound: InboxMessage = { ...base, direction: "outbound", read_at: null };
    expect(isUnreadMessage(unreadMsg)).toBe(true);
    expect(isUnreadMessage(readMsg)).toBe(false);
    expect(isUnreadMessage(outbound)).toBe(false);
    expect(deriveUnreadCount([unreadMsg, readMsg, outbound])).toBe(1);
  });

  it("normalizes subjects for thread matching", () => {
    expect(normalizeSubject("Re: Fwd: Hello World ")).toBe("hello world");
    expect(normalizeSubject("RE: re: Pricing")).toBe("pricing");
    expect(normalizeSubject(null)).toBe("");
    expect(normalizeSubject("")).toBe("");
  });

  it("derives a reply subject without stacking Re: prefixes", () => {
    const conv = { subject: "Pricing question" } as InboxConversation;
    expect(deriveReplySubject(conv)).toBe("Re: Pricing question");
    const convRe = { subject: "Re: Pricing question" } as InboxConversation;
    expect(deriveReplySubject(convRe)).toBe("Re: Pricing question");
    const convNone = { subject: null } as InboxConversation;
    expect(deriveReplySubject(convNone)).toBe("Re: your message");
  });

  it("summarizes a conversation with preview + unread state", () => {
    const conv: InboxConversation = {
      id: "c1",
      workspace_id: "ws",
      lead_id: null,
      channel: "email",
      subject: "Hi",
      contact_name: "Elena",
      contact_email: "elena@x.io",
      company: null,
      status: "open",
      assignee_id: null,
      is_demo: true,
      last_message_at: "2024-10-10T00:00:00.000Z",
      created_at: "2024-10-10T00:00:00.000Z",
    };
    const msgs: InboxMessage[] = [
      {
        id: "m1",
        workspace_id: "ws",
        conversation_id: "c1",
        lead_id: null,
        channel: "email",
        direction: "inbound",
        content: "Sounds good",
        status: "received",
        is_demo: true,
        sent_at: "2024-10-10T00:00:00.000Z",
        read_at: null,
      },
    ];
    const summary = summarizeConversation(conv, msgs);
    expect(summary.unread).toBe(true);
    expect(summary.unread_count).toBe(1);
    expect(summary.last_message_preview).toBe("Sounds good");
    expect(summary.last_message_direction).toBe("inbound");
  });
});

// ── Demo repository ─────────────────────────────────────────────────────────

describe("DemoInboxRepository", () => {
  it("seeds 4 conversations from the mock messages, grouped by lead + channel", async () => {
    const repo = createInboxRepository("demo");
    const { conversations, total } = await repo.listConversations(DEMO_WORKSPACE_ID);
    expect(total).toBe(4);
    expect(conversations).toHaveLength(4);
    // Newest activity first: Priya (email, 2024-10-12) leads the list.
    expect(conversations[0].contact_email).toBe("priya.patel@finpulse.tech");
    const sarah = conversations.find((c) => c.contact_email === "sarah.jenkins@stripe.com");
    expect(sarah?.channel).toBe("linkedin");
    expect(sarah?.company).toBe("Stripe");
  });

  it("derives unread conversations from inbound read state (2 seeded)", async () => {
    const repo = createInboxRepository("demo");
    expect(await repo.getUnreadConversationCount(DEMO_WORKSPACE_ID)).toBe(2);
    const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID, {
      unreadOnly: true,
    });
    expect(conversations.map((c) => c.contact_email).sort()).toEqual([
      "elena@scalewave.io",
      "sarah.jenkins@stripe.com",
    ]);
  });

  it("marks a thread read persistently and decrements the unread count", async () => {
    const repo = createInboxRepository("demo");
    const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
    const elena = conversations.find((c) => c.contact_email === "elena@scalewave.io")!;
    const marked = await repo.markConversationRead(DEMO_WORKSPACE_ID, elena.id);
    expect(marked).toBe(1);
    expect(await repo.getUnreadConversationCount(DEMO_WORKSPACE_ID)).toBe(1);
    const thread = await repo.getThread(DEMO_WORKSPACE_ID, elena.id);
    const inbound = thread!.messages.find((m) => m.direction === "inbound");
    expect(inbound?.read_at).not.toBeNull();
    // Idempotent: a second mark-read changes nothing.
    expect(await repo.markConversationRead(DEMO_WORKSPACE_ID, elena.id)).toBe(0);
  });

  it("scopes everything to the workspace — other tenants see nothing", async () => {
    const repo = createInboxRepository("demo");
    const { total } = await repo.listConversations("ws_someone_else");
    expect(total).toBe(0);
    expect(await repo.getThread("ws_someone_else", "conv_demo_001")).toBeNull();
    expect(await repo.getUnreadConversationCount("ws_someone_else")).toBe(0);
  });

  it("supports search, channel filter and pagination", async () => {
    const repo = createInboxRepository("demo");
    const bySearch = await repo.listConversations(DEMO_WORKSPACE_ID, { search: "scalewave" });
    expect(bySearch.total).toBe(1);
    expect(bySearch.conversations[0].contact_email).toBe("elena@scalewave.io");
    const emailOnly = await repo.listConversations(DEMO_WORKSPACE_ID, { channel: "email" });
    expect(emailOnly.total).toBe(2);
    const page1 = await repo.listConversations(DEMO_WORKSPACE_ID, { limit: 2, offset: 0 });
    const page2 = await repo.listConversations(DEMO_WORKSPACE_ID, { limit: 2, offset: 2 });
    expect(page1.conversations).toHaveLength(2);
    expect(page2.conversations).toHaveLength(2);
    expect(page1.conversations[0].id).not.toBe(page2.conversations[0].id);
  });

  it("finds reply attempts by idempotency key and updates them in place", async () => {
    const repo = createInboxRepository("demo");
    const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
    const elena = conversations.find((c) => c.channel === "email")!;
    const inserted = await repo.insertMessage({
      workspace_id: DEMO_WORKSPACE_ID,
      conversation_id: elena.id,
      lead_id: elena.lead_id,
      channel: "email",
      direction: "outbound",
      subject: "Re: test",
      content: "hello",
      status: "queued",
      is_demo: true,
      idempotency_key: "key-1",
    });
    const found = await repo.findMessageByIdempotencyKey(
      DEMO_WORKSPACE_ID,
      elena.id,
      "key-1"
    );
    expect(found?.id).toBe(inserted.id);
    const updated = await repo.updateMessage(DEMO_WORKSPACE_ID, inserted.id, {
      status: "failed",
      error: "boom",
    });
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("boom");
    const thread = await repo.getThread(DEMO_WORKSPACE_ID, elena.id);
    expect(thread!.messages.filter((m) => m.idempotency_key === "key-1")).toHaveLength(1);
  });
});
