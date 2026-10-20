import { describe, it, expect, vi } from "vitest";
import {
  ingestReceivedEmail,
  type InboundStore,
  type ReceivedEmailContent,
} from "../inbound";

/**
 * Reply-arrival notifications (P5 Stage D): ingestion notifies the
 * owning workspace exactly once per filed reply — never for unrouted
 * mail (no workspace owns it), never for duplicates (the reply was
 * already announced), and a notification failure never fails the
 * ingest itself (the reply is durably filed first).
 */

function email(partial: Partial<ReceivedEmailContent>): ReceivedEmailContent {
  return {
    providerMessageId: "rcv_1",
    from: "Elena Rostova <elena@scalewave.io>",
    to: ["hello@mail.nxtsend-demo.com"],
    subject: "Re: Scaling founder-led outbound for ScaleWave",
    text: "Do you have 15 mins this Thursday?",
    html: null,
    messageIdHeader: null,
    inReplyTo: null,
    references: [],
    receivedAt: "2026-10-20T00:00:00.000Z",
    ...partial,
  };
}

interface NotifyCall {
  workspaceId: string;
  conversationId: string;
  senderName: string;
  senderEmail: string;
  subject: string | null;
  preview: string;
}

function fakeStore(opts: {
  existing?: { conversation_id: string } | null;
  candidates?: Array<{
    id: string;
    workspace_id: string;
    lead_id: string | null;
    contact_email: string;
    subject: string | null;
    last_message_at: string;
  }>;
  notifyError?: boolean;
}): { store: InboundStore; calls: NotifyCall[] } {
  const calls: NotifyCall[] = [];
  const store: InboundStore = {
    async findByProviderMessageId() {
      return opts.existing ?? null;
    },
    async findReferenceTarget() {
      return null;
    },
    async listCandidateConversations() {
      return opts.candidates ?? [];
    },
    async listLeadsByEmail() {
      return [];
    },
    async createConversation() {
      return { id: "conv_new" };
    },
    async insertInboundMessage() {
      return { id: "msg_new" };
    },
    async touchConversation() {},
    async notifyReplyReceived(input) {
      if (opts.notifyError) throw new Error("notifications table unavailable");
      calls.push(input);
    },
  };
  return { store, calls };
}

const CANDIDATE = {
  id: "conv_elena",
  workspace_id: "ws_1",
  lead_id: "lead_1",
  contact_email: "elena@scalewave.io",
  subject: "Scaling founder-led outbound for ScaleWave",
  last_message_at: "2026-10-19T00:00:00.000Z",
};

describe("ingestReceivedEmail — reply notifications", () => {
  it("notifies the owning workspace once when a reply is filed", async () => {
    const { store, calls } = fakeStore({ candidates: [CANDIDATE] });
    const outcome = await ingestReceivedEmail(store, email({}));
    expect(outcome.status).toBe("ingested");
    expect(calls).toHaveLength(1);
    expect(calls[0].workspaceId).toBe("ws_1");
    expect(calls[0].conversationId).toBe("conv_elena");
    expect(calls[0].senderEmail).toBe("elena@scalewave.io");
    expect(calls[0].senderName).toBe("Elena Rostova");
    expect(calls[0].preview).toContain("15 mins");
  });

  it("does NOT notify for unrouted mail (no workspace owns it)", async () => {
    const { store, calls } = fakeStore({ candidates: [] });
    const outcome = await ingestReceivedEmail(
      store,
      email({ from: "stranger@example.com" })
    );
    expect(outcome.status).toBe("unrouted");
    expect(calls).toHaveLength(0);
  });

  it("does NOT notify for a duplicate delivery", async () => {
    const { store, calls } = fakeStore({
      existing: { conversation_id: "conv_elena" },
    });
    const outcome = await ingestReceivedEmail(store, email({}));
    expect(outcome.status).toBe("duplicate");
    expect(calls).toHaveLength(0);
  });

  it("a failing notification never fails the ingest", async () => {
    const { store } = fakeStore({
      candidates: [CANDIDATE],
      notifyError: true,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await ingestReceivedEmail(store, email({}));
    expect(outcome.status).toBe("ingested");
    spy.mockRestore();
  });

  it("stores without a notify hook still ingest (hook is optional)", async () => {
    const { store } = fakeStore({ candidates: [CANDIDATE] });
    delete store.notifyReplyReceived;
    const outcome = await ingestReceivedEmail(store, email({}));
    expect(outcome.status).toBe("ingested");
  });
});
