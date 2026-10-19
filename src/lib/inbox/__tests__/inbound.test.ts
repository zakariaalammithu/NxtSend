import { describe, it, expect } from "vitest";
import {
  ingestReceivedEmail,
  matchInboundConversation,
  parseAddress,
  stripHtml,
  type InboundCandidateConversation,
  type InboundLeadRef,
  type InboundStore,
  type ReceivedEmailContent,
} from "@/lib/inbox/inbound";

const WS_A = "ws_a";
const WS_B = "ws_b";

function candidate(
  partial: Partial<InboundCandidateConversation>
): InboundCandidateConversation {
  return {
    id: "conv_1",
    workspace_id: WS_A,
    lead_id: "lead_1",
    contact_email: "elena@scalewave.io",
    subject: "Scaling founder-led outbound",
    last_message_at: "2024-10-10T00:00:00.000Z",
    ...partial,
  };
}

const EMAIL: ReceivedEmailContent = {
  providerMessageId: "re_inbound_1",
  from: "Elena Rivera <elena@scalewave.io>",
  to: ["alex@inbound.example.com"],
  subject: "Re: Scaling founder-led outbound",
  text: "Thursday works for me.",
  html: null,
  messageIdHeader: "<abc@mail.scalewave.io>",
  inReplyTo: null,
  references: [],
  receivedAt: "2024-10-11T09:00:00.000Z",
};

class FakeInboundStore implements InboundStore {
  inserted: unknown[] = [];
  created: unknown[] = [];
  touched: string[] = [];
  constructor(
    private opts: {
      existing?: { conversation_id: string } | null;
      referenceTarget?: { conversationId: string; workspaceId: string } | null;
      candidates?: InboundCandidateConversation[];
      leads?: InboundLeadRef[];
    } = {}
  ) {}
  async findByProviderMessageId() {
    return this.opts.existing ?? null;
  }
  async findReferenceTarget() {
    return this.opts.referenceTarget ?? null;
  }
  async listCandidateConversations() {
    return this.opts.candidates ?? [];
  }
  async listLeadsByEmail() {
    return this.opts.leads ?? [];
  }
  async createConversation(input: unknown) {
    this.created.push(input);
    return { id: "conv_new" };
  }
  async insertInboundMessage(input: unknown) {
    this.inserted.push(input);
    return { id: "msg_new" };
  }
  async touchConversation(_ws: string, id: string) {
    this.touched.push(id);
  }
}

describe("matchInboundConversation (pure heuristic)", () => {
  it("prefers a threading-header reference target over everything", () => {
    const match = matchInboundConversation({
      senderEmail: "elena@scalewave.io",
      subject: "Unrelated subject",
      referenceTarget: { conversationId: "conv_ref", workspaceId: WS_B },
      candidates: [candidate({})],
      leads: [],
    });
    expect(match).toEqual({
      kind: "conversation",
      conversationId: "conv_ref",
      workspaceId: WS_B,
    });
  });

  it("matches by normalized subject within one workspace", () => {
    const match = matchInboundConversation({
      senderEmail: "elena@scalewave.io",
      subject: "Re: Scaling founder-led outbound",
      referenceTarget: null,
      candidates: [candidate({})],
      leads: [],
    });
    expect(match.kind).toBe("conversation");
    if (match.kind === "conversation") expect(match.conversationId).toBe("conv_1");
  });

  it("matches by contact alone when all candidates share one workspace", () => {
    const match = matchInboundConversation({
      senderEmail: "elena@scalewave.io",
      subject: "A brand new topic",
      referenceTarget: null,
      candidates: [candidate({})],
      leads: [],
    });
    expect(match.kind).toBe("conversation");
  });

  it("refuses to guess when the contact has conversations in two workspaces", () => {
    const match = matchInboundConversation({
      senderEmail: "elena@scalewave.io",
      subject: "A brand new topic",
      referenceTarget: null,
      candidates: [
        candidate({ id: "conv_a", workspace_id: WS_A }),
        candidate({ id: "conv_b", workspace_id: WS_B }),
      ],
      leads: [],
    });
    expect(match.kind).toBe("unrouted");
  });

  it("creates a conversation when the sender is a lead in exactly one workspace", () => {
    const match = matchInboundConversation({
      senderEmail: "new@lead.io",
      subject: "Intro",
      referenceTarget: null,
      candidates: [],
      leads: [{ id: "lead_9", workspace_id: WS_A, name: "New Lead", company: null }],
    });
    expect(match).toEqual({ kind: "create", workspaceId: WS_A, leadId: "lead_9" });
  });

  it("is unrouted for unknown senders", () => {
    const match = matchInboundConversation({
      senderEmail: "stranger@nowhere.io",
      subject: "Hello",
      referenceTarget: null,
      candidates: [],
      leads: [],
    });
    expect(match.kind).toBe("unrouted");
  });
});

describe("ingestReceivedEmail", () => {
  it("ingests into the subject-matched conversation and touches it", async () => {
    const store = new FakeInboundStore({ candidates: [candidate({})] });
    const outcome = await ingestReceivedEmail(store, EMAIL);
    expect(outcome.status).toBe("ingested");
    expect(store.inserted).toHaveLength(1);
    expect(store.touched).toEqual(["conv_1"]);
    const inserted = store.inserted[0] as { content: string; providerMessageId: string };
    expect(inserted.content).toBe("Thursday works for me.");
    expect(inserted.providerMessageId).toBe("re_inbound_1");
  });

  it("dedupes by provider message ID — a redelivery inserts nothing", async () => {
    const store = new FakeInboundStore({
      existing: { conversation_id: "conv_1" },
      candidates: [candidate({})],
    });
    const outcome = await ingestReceivedEmail(store, EMAIL);
    expect(outcome.status).toBe("duplicate");
    expect(store.inserted).toHaveLength(0);
  });

  it("creates a conversation for a known lead with no existing thread", async () => {
    const store = new FakeInboundStore({
      leads: [{ id: "lead_9", workspace_id: WS_A, name: "New Lead", company: "Acme" }],
    });
    const outcome = await ingestReceivedEmail(store, {
      ...EMAIL,
      from: "new@lead.io",
      subject: "Intro call",
    });
    expect(outcome.status).toBe("ingested");
    expect(store.created).toHaveLength(1);
    expect(store.inserted).toHaveLength(1);
  });

  it("leaves unknown senders unrouted and stores nothing", async () => {
    const store = new FakeInboundStore({});
    const outcome = await ingestReceivedEmail(store, {
      ...EMAIL,
      from: "stranger@nowhere.io",
    });
    expect(outcome.status).toBe("unrouted");
    expect(store.inserted).toHaveLength(0);
    expect(store.created).toHaveLength(0);
  });

  it("falls back to stripped HTML when there is no text body", async () => {
    const store = new FakeInboundStore({ candidates: [candidate({})] });
    await ingestReceivedEmail(store, {
      ...EMAIL,
      text: null,
      html: "<p>Hello <b>there</b></p><p>Second line</p>",
    });
    const inserted = store.inserted[0] as { content: string };
    expect(inserted.content).toContain("Hello there");
    expect(inserted.content).not.toContain("<p>");
  });
});

describe("address + html helpers", () => {
  it("parses Name <email> addresses", () => {
    expect(parseAddress("Elena Rivera <elena@scalewave.io>")).toEqual({
      email: "elena@scalewave.io",
      name: "Elena Rivera",
    });
    expect(parseAddress("elena@scalewave.io").email).toBe("elena@scalewave.io");
  });

  it("strips tags and decodes entities", () => {
    expect(stripHtml("<p>Fish &amp; Chips</p>")).toBe("Fish & Chips");
  });
});
