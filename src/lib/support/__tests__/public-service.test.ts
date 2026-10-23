import { describe, it, expect } from "vitest";
import { DemoSupportStore } from "../demo-store";
import { hashGuestToken } from "../guest-auth";
import {
  createSupportConversation,
  escalateSupportConversation,
  getCurrentSupportConversation,
  getSupportConfig,
  markSupportVisitorRead,
  postSupportMessage,
  reopenSupportConversation,
} from "../public-service";
import type { VisitorIdentity } from "../request-auth";
import type { SupportStore } from "../store";

const guestless: VisitorIdentity = { user: null, guestTokenHash: null };

async function makeGuest(store: SupportStore) {
  const created = await createSupportConversation(store, guestless, {
    name: "Test Guest",
    email: "guest@example.com",
  });
  expect(created.status).toBe(201);
  expect(created.rawGuestToken).toBeTruthy();
  const identity: VisitorIdentity = {
    user: null,
    guestTokenHash: hashGuestToken(created.rawGuestToken!),
  };
  const conversationId = (created.body.conversation as { id: string }).id;
  return { created, identity, conversationId };
}

describe("public config", () => {
  it("reports honest states: demo mode, AI enhancement not configured", async () => {
    const store = new DemoSupportStore();
    const config = await getSupportConfig(store);
    expect(config.status).toBe(200);
    expect(config.body.mode).toBe("demo");
    expect(config.body.ai_enhancement).toBe("not_configured");
    // The demo super admin is declared available + eligible.
    expect(config.body.live_available).toBe(true);
    // No internals leak into the public projection.
    expect(JSON.stringify(config.body)).not.toContain("token");
    expect(JSON.stringify(config.body)).not.toContain("demo-agent@");
  });
});

describe("guest conversation lifecycle", () => {
  it("creates a conversation with the welcome message; the raw token never enters the body", async () => {
    const store = new DemoSupportStore();
    const { created, conversationId } = await makeGuest(store);
    const messages = created.body.messages as Array<{ sender_type: string; body: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].sender_type).toBe("ai");
    expect(JSON.stringify(created.body)).not.toContain(created.rawGuestToken!);

    const stored = await store.getConversation(conversationId);
    expect(stored?.guest_access_token_hash).toBe(hashGuestToken(created.rawGuestToken!));
    expect(stored?.guest_email).toBe("guest@example.com");
  });

  it("answers a seeded question from the KB with its source recorded", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    const result = await postSupportMessage(store, identity, conversationId, {
      body: "How much does NxtSend cost?",
    });
    expect(result.status).toBe(201);
    const messages = result.body.messages as Array<{
      sender_type: string;
      body: string;
    }>;
    expect(messages.length).toBe(2);
    expect(messages[1].sender_type).toBe("ai");
    expect(messages[1].body).toContain("$49 per seat per month");

    const stored = await store.listMessages(conversationId, { includeInternal: true });
    const botReply = stored.find((m) => m.sender_type === "ai" && m.metadata.engine === "kb_match");
    expect(botReply).toBeDefined();
    expect(botReply?.source_knowledge_id).toBeTruthy();
    expect(botReply?.metadata.score).toBe(100);
  });

  it("falls back honestly on an unknown question and flags the escalation offer", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    const result = await postSupportMessage(store, identity, conversationId, {
      body: "Can you book me a flight to Dhaka next Tuesday?",
    });
    const messages = result.body.messages as Array<{ sender_type: string; body: string }>;
    const botReply = messages[messages.length - 1];
    expect(botReply.sender_type).toBe("ai");
    expect(botReply.body).toContain("couldn't find a reliable answer");
    const conversation = await store.getConversation(conversationId);
    expect(conversation?.metadata.escalation_offered_at).toBeTruthy();
  });

  it("routes account-specific questions to the account guard, never to KB data", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    const result = await postSupportMessage(store, identity, conversationId, {
      body: "Where is my invoice for last month?",
    });
    const messages = result.body.messages as Array<{ body: string }>;
    const botReply = messages[messages.length - 1];
    expect(botReply.body).toContain("can't see your own account details");
    expect(botReply.body).toContain("Dashboard → Billing");
  });

  it("cross-guest isolation: another guest's token gets a 404, ID-only gets a 404", async () => {
    const store = new DemoSupportStore();
    const alice = await makeGuest(store);
    const bob = await makeGuest(store);

    const asBob = await postSupportMessage(store, bob.identity, alice.conversationId, {
      body: "sneaking in",
    });
    expect(asBob.status).toBe(404);

    const idOnly = await postSupportMessage(store, guestless, alice.conversationId, {
      body: "no proof at all",
    });
    expect(idOnly.status).toBe(404);

    const wrongToken: VisitorIdentity = {
      user: null,
      guestTokenHash: hashGuestToken("a-completely-different-token"),
    };
    const asWrong = await postSupportMessage(store, wrongToken, alice.conversationId, {
      body: "wrong token",
    });
    expect(asWrong.status).toBe(404);
  });

  it("idempotent retry: same client_message_id never duplicates", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    const first = await postSupportMessage(store, identity, conversationId, {
      body: "How do I export my leads?",
      clientMessageId: "client-msg-1",
    });
    expect(first.status).toBe(201);
    const countAfterFirst = (await store.listMessages(conversationId, { includeInternal: true })).length;

    const retry = await postSupportMessage(store, identity, conversationId, {
      body: "How do I export my leads?",
      clientMessageId: "client-msg-1",
    });
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBe(true);
    const countAfterRetry = (await store.listMessages(conversationId, { includeInternal: true })).length;
    expect(countAfterRetry).toBe(countAfterFirst);
  });

  it("visitor unread counter rises with bot replies and resets on read", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    await postSupportMessage(store, identity, conversationId, {
      body: "How do I export my leads?",
    });
    let conversation = await store.getConversation(conversationId);
    // welcome message + bot answer
    expect(conversation?.visitor_unread_count).toBe(2);
    expect(conversation?.agent_unread_count).toBe(1);

    const read = await markSupportVisitorRead(store, identity, conversationId);
    expect(read.status).toBe(200);
    conversation = await store.getConversation(conversationId);
    expect(conversation?.visitor_unread_count).toBe(0);
  });

  it("current conversation resolves by guest cookie and supports the after cursor", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    await postSupportMessage(store, identity, conversationId, {
      body: "How do I export my leads?",
    });
    const current = await getCurrentSupportConversation(store, identity);
    expect(current.status).toBe(200);
    const all = current.body.messages as Array<{ sequence_no: number }>;
    expect(all.length).toBe(3);

    const after = await getCurrentSupportConversation(store, identity, all[0].sequence_no);
    const rest = after.body.messages as Array<{ sequence_no: number }>;
    expect(rest.length).toBe(2);
    expect(rest[0].sequence_no).toBeGreaterThan(all[0].sequence_no);

    const nobody = await getCurrentSupportConversation(store, guestless);
    expect(nobody.status).toBe(404);
  });
});

describe("escalation & human mode", () => {
  it("escalates: mode flips, event appended, no more bot answers afterwards", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    const escalated = await escalateSupportConversation(store, identity, conversationId);
    expect(escalated.status).toBe(200);
    expect(escalated.body.agent_available).toBe(true);

    let conversation = await store.getConversation(conversationId);
    expect(conversation?.handling_mode).toBe("human");
    expect(conversation?.escalated_at).toBeTruthy();
    const events = await store.listEvents(conversationId);
    expect(events.some((e) => e.event_type === "escalated")).toBe(true);

    const before = (await store.listMessages(conversationId, { includeInternal: true })).length;
    const posted = await postSupportMessage(store, identity, conversationId, {
      body: "How much does NxtSend cost?",
    });
    expect(posted.status).toBe(201);
    const postedMessages = posted.body.messages as Array<{ sender_type: string }>;
    // Only the visitor's own message comes back — no bot reply in human mode.
    expect(postedMessages.length).toBe(1);
    const after = (await store.listMessages(conversationId, { includeInternal: true })).length;
    expect(after).toBe(before + 1);
    conversation = await store.getConversation(conversationId);
    expect(conversation?.agent_unread_count).toBeGreaterThan(0);
  });

  it("escalation is idempotent and reopen works from resolved", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    await escalateSupportConversation(store, identity, conversationId);
    const again = await escalateSupportConversation(store, identity, conversationId);
    expect(again.status).toBe(200);
    expect(again.body.already).toBe(true);

    await store.updateConversation(conversationId, {
      status: "resolved",
      resolved_at: new Date().toISOString(),
    });
    const reopened = await reopenSupportConversation(store, identity, conversationId);
    expect(reopened.status).toBe(200);
    const conversation = await store.getConversation(conversationId);
    expect(conversation?.status).toBe("open");
    expect(conversation?.resolved_at).toBeNull();
  });

  it("a new message on a resolved conversation reopens it in the write path", async () => {
    const store = new DemoSupportStore();
    const { identity, conversationId } = await makeGuest(store);
    await store.updateConversation(conversationId, {
      status: "resolved",
      resolved_at: new Date().toISOString(),
    });
    await postSupportMessage(store, identity, conversationId, {
      body: "Actually, one more thing — how do I export my leads?",
    });
    const conversation = await store.getConversation(conversationId);
    expect(conversation?.status).toBe("open");
    const events = await store.listEvents(conversationId);
    expect(events.some((e) => e.event_type === "reopened")).toBe(true);
  });
});

describe("registered users", () => {
  const userIdentity: VisitorIdentity = {
    user: { userId: "user-42", displayName: "Registered Rita", status: "active" },
    guestTokenHash: null,
  };

  it("binds the conversation to the session user and reuses the open thread", async () => {
    const store = new DemoSupportStore();
    const first = await createSupportConversation(store, userIdentity, {});
    expect(first.status).toBe(201);
    expect(first.rawGuestToken).toBeUndefined();
    const conversationId = (first.body.conversation as { id: string }).id;
    const stored = await store.getConversation(conversationId);
    expect(stored?.user_id).toBe("user-42");
    expect(stored?.guest_access_token_hash).toBeNull();

    const second = await createSupportConversation(store, userIdentity, {});
    expect(second.status).toBe(200);
    expect(second.body.existing).toBe(true);
    expect((second.body.conversation as { id: string }).id).toBe(conversationId);
  });

  it("suspended users are refused", async () => {
    const store = new DemoSupportStore();
    const suspended: VisitorIdentity = {
      user: { userId: "user-bad", displayName: "Suspended Sam", status: "suspended" },
      guestTokenHash: null,
    };
    const created = await createSupportConversation(store, suspended, {});
    expect(created.status).toBe(403);
    const { identity, conversationId } = await makeGuest(store);
    void identity;
    const posted = await postSupportMessage(store, suspended, conversationId, { body: "hi" });
    expect(posted.status).toBe(403);
  });
});
