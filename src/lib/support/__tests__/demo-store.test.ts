import { describe, it, expect } from "vitest";
import { DemoSupportStore } from "../demo-store";
import { SEED_KNOWLEDGE } from "../seeds";

describe("demo store — parity smoke", () => {
  it("seeds settings, categories, knowledge and saved replies", async () => {
    const store = new DemoSupportStore();
    const settings = await store.getSettings();
    expect(settings.display_name).toBe("NxtSend Support");
    expect(settings.support_email).toBe("hello@nxtsend.com");
    expect(settings.ai_enhancement_enabled).toBe(false);

    const categories = await store.listCategories();
    expect(categories.length).toBe(8);

    const answerable = await store.listAnswerable();
    expect(answerable.length).toBe(SEED_KNOWLEDGE.length);
    for (const { entry } of answerable) {
      expect(entry.status).toBe("published");
      expect(entry.enabled).toBe(true);
      expect(entry.indexed_at).not.toBeNull();
      expect(entry.content_hash).toBeTruthy();
      expect(entry.search_text.length).toBeGreaterThan(0);
    }

    const replies = await store.listSavedReplies();
    expect(replies.length).toBeGreaterThanOrEqual(5);
  });

  it("carries labelled demo conversations across the queues", async () => {
    const store = new DemoSupportStore();
    const { conversations, counts } = await store.listConversations({});
    expect(conversations.length).toBe(4);
    expect(counts.all).toBe(4);
    expect(counts.waiting_for_reply).toBeGreaterThanOrEqual(1);
    expect(counts.assigned).toBeGreaterThanOrEqual(1);
    expect(counts.resolved).toBe(1);
    for (const conversation of conversations) {
      expect(conversation.metadata.demo_fixture).toBe(true);
    }
    const names = conversations.map((c) => c.guest_name ?? "").join(" ");
    expect(names).toContain("Demo Visitor");
  });

  it("postMessage maintains unread counters by construction", async () => {
    const store = new DemoSupportStore();
    const conversation = await store.createConversation({
      user_id: null,
      guest_name: "Counter Tester",
      guest_email: null,
      guest_access_token_hash: "counter-hash",
      guest_token_expires_at: null,
      workspace_id: null,
      source: "marketing_widget",
      metadata: {},
    });
    expect(conversation.agent_unread_count).toBe(0);

    const posted = await store.postMessage({
      conversation_id: conversation.id,
      sender_type: "visitor",
      sender_profile_id: null,
      sender_display_name: "Counter Tester",
      kind: "message",
      body: "Hello there",
    });
    expect(posted.conversation.agent_unread_count).toBe(1);
    expect(posted.conversation.last_message_preview).toBe("Hello there");

    const reply = await store.postMessage({
      conversation_id: conversation.id,
      sender_type: "ai",
      sender_profile_id: null,
      sender_display_name: "NxtSend Support",
      kind: "message",
      body: "Hi! How can I help?",
    });
    expect(reply.conversation.visitor_unread_count).toBe(1);

    // Internal notes touch NO counter and never become the preview.
    const note = await store.postMessage({
      conversation_id: conversation.id,
      sender_type: "agent",
      sender_profile_id: "demo-profile-agent",
      sender_display_name: "Demo Support Agent",
      kind: "internal_note",
      body: "Internal: checking with the team.",
    });
    expect(note.conversation.visitor_unread_count).toBe(1);
    expect(note.conversation.agent_unread_count).toBe(1);
    expect(note.conversation.last_message_preview).toBe("Hi! How can I help?");

    await store.markVisitorRead(conversation.id);
    const afterRead = await store.getConversation(conversation.id);
    expect(afterRead?.visitor_unread_count).toBe(0);
    await store.markAgentRead(conversation.id);
    const afterAgentRead = await store.getConversation(conversation.id);
    expect(afterAgentRead?.agent_unread_count).toBe(0);
  });

  it("visitor projections hide internal notes", async () => {
    const store = new DemoSupportStore();
    const { conversations } = await store.listConversations({});
    const tom = conversations.find((c) => c.guest_name?.includes("Tom"));
    expect(tom).toBeDefined();
    await store.postMessage({
      conversation_id: tom!.id,
      sender_type: "agent",
      sender_profile_id: "demo-profile-agent",
      sender_display_name: "Demo Support Agent",
      kind: "internal_note",
      body: "Secret internal note",
    });
    const visitorView = await store.listMessages(tom!.id, { includeInternal: false });
    expect(visitorView.some((m) => m.body.includes("Secret internal note"))).toBe(false);
    const adminView = await store.listMessages(tom!.id, { includeInternal: true });
    expect(adminView.some((m) => m.body.includes("Secret internal note"))).toBe(true);
  });

  it("KB writes re-index in the same operation; draft/disabled are not answerable", async () => {
    const store = new DemoSupportStore();
    const categories = await store.listCategories();
    const created = await store.createKnowledge(
      {
        category_id: categories[0].id,
        slug: "test-entry-zorblax",
        title: "Zorblax handling",
        question: "What is a zorblax?",
        answer: "A zorblax is a test fixture.",
        keywords: ["zorblax"],
        related_url: null,
        priority: 50,
        enabled: true,
        status: "draft",
      },
      null
    );
    expect(created.indexed_at).not.toBeNull();
    expect(created.content_hash).toBeTruthy();
    let answerable = await store.listAnswerable();
    expect(answerable.some((a) => a.entry.id === created.id)).toBe(false);

    const published = await store.updateKnowledge(created.id, { status: "published" }, null);
    expect(published?.indexed_at).not.toBeNull();
    answerable = await store.listAnswerable();
    expect(answerable.some((a) => a.entry.id === created.id)).toBe(true);

    await store.updateKnowledge(created.id, { enabled: false }, null);
    answerable = await store.listAnswerable();
    expect(answerable.some((a) => a.entry.id === created.id)).toBe(false);

    // Disabling the CATEGORY removes its entries too.
    await store.updateKnowledge(created.id, { enabled: true }, null);
    await store.updateCategory(categories[0].id, { enabled: false }, null);
    answerable = await store.listAnswerable();
    expect(answerable.some((a) => a.entry.category_id === categories[0].id)).toBe(false);
  });
});
