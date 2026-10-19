import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "crypto";
import {
  signSvixPayload,
  handleResendWebhook,
  type EmailEventStore,
} from "../webhook";
import type { ReceivedEmailContent } from "@/lib/inbox/inbound";

const SIGNING_KEY = `whsec_${randomBytes(32).toString("base64")}`;
const NOW = 1_760_000_000;

function signedHeaders(id: string, body: string) {
  return {
    id,
    timestamp: String(NOW),
    signature: `v1,${signSvixPayload(SIGNING_KEY, id, NOW, body)}`,
  };
}

const RECEIVED_BODY = JSON.stringify({
  type: "email.received",
  data: {
    email_id: "re_inbound_1",
    from: "elena@scalewave.io",
    to: ["alex@inbound.example.com"],
    subject: "Re: Scaling founder-led outbound",
  },
});

const FETCHED: ReceivedEmailContent = {
  providerMessageId: "re_inbound_1",
  from: "elena@scalewave.io",
  to: ["alex@inbound.example.com"],
  subject: "Re: Scaling founder-led outbound",
  text: "Thursday works for me.",
  html: null,
  messageIdHeader: null,
  inReplyTo: null,
  references: [],
  receivedAt: "2024-10-11T09:00:00.000Z",
};

class FakeStore implements EmailEventStore {
  events = new Set<string>();
  recorded: string[] = [];
  ingested: ReceivedEmailContent[] = [];
  async hasEvent(id: string) {
    return this.events.has(id);
  }
  async recordEvent(evt: { providerEventId: string }) {
    this.events.add(evt.providerEventId);
    this.recorded.push(evt.providerEventId);
  }
  async updateMessageStatus() {}
  async getMessageWorkspace() {
    return null;
  }
  async addSuppression() {}
  async ingestReceivedEmail(email: ReceivedEmailContent) {
    this.ingested.push(email);
    return { status: "ingested" as const, conversationId: "conv_1" };
  }
}

describe("handleResendWebhook — email.received (inbound)", () => {
  it("verifies, fetches content, records the event and ingests", async () => {
    const store = new FakeStore();
    const fetchReceivedEmail = vi.fn(async () => FETCHED);
    const result = await handleResendWebhook({
      rawBody: RECEIVED_BODY,
      headers: signedHeaders("svix_1", RECEIVED_BODY),
      secret: SIGNING_KEY,
      store,
      nowSeconds: NOW,
      fetchReceivedEmail,
    });
    expect(result.status).toBe(200);
    expect(result.body.ingested).toBe(true);
    expect(result.body.conversationId).toBe("conv_1");
    expect(fetchReceivedEmail).toHaveBeenCalledWith("re_inbound_1");
    expect(store.ingested).toHaveLength(1);
    expect(store.recorded).toEqual(["svix_1"]);
  });

  it("dedupes redeliveries by svix id before fetching or ingesting", async () => {
    const store = new FakeStore();
    store.events.add("svix_1");
    const fetchReceivedEmail = vi.fn(async () => FETCHED);
    const result = await handleResendWebhook({
      rawBody: RECEIVED_BODY,
      headers: signedHeaders("svix_1", RECEIVED_BODY),
      secret: SIGNING_KEY,
      store,
      nowSeconds: NOW,
      fetchReceivedEmail,
    });
    expect(result.status).toBe(200);
    expect(result.body.duplicate).toBe(true);
    expect(fetchReceivedEmail).not.toHaveBeenCalled();
    expect(store.ingested).toHaveLength(0);
  });

  it("answers 502 WITHOUT recording when the content fetch fails, so the provider retries", async () => {
    const store = new FakeStore();
    const fetchReceivedEmail = vi.fn(async () => {
      throw new Error("Resend Receiving API failed (500)");
    });
    const result = await handleResendWebhook({
      rawBody: RECEIVED_BODY,
      headers: signedHeaders("svix_2", RECEIVED_BODY),
      secret: SIGNING_KEY,
      store,
      nowSeconds: NOW,
      fetchReceivedEmail,
    });
    expect(result.status).toBe(502);
    expect(store.recorded).toHaveLength(0);
    expect(store.ingested).toHaveLength(0);
  });

  it("logs but does not ingest when inbound wiring is absent", async () => {
    const inner = new FakeStore();
    // A store WITHOUT the optional ingestReceivedEmail capability.
    const store: EmailEventStore = {
      hasEvent: (id) => inner.hasEvent(id),
      recordEvent: (e) => inner.recordEvent(e),
      updateMessageStatus: async () => {},
      getMessageWorkspace: async () => null,
      addSuppression: async () => {},
    };
    const result = await handleResendWebhook({
      rawBody: RECEIVED_BODY,
      headers: signedHeaders("svix_3", RECEIVED_BODY),
      secret: SIGNING_KEY,
      store,
      nowSeconds: NOW,
      fetchReceivedEmail: async () => FETCHED,
    });
    expect(result.status).toBe(200);
    expect(result.body.ingested).toBe(false);
    expect(inner.recorded).toEqual(["svix_3"]);
  });

  it("still rejects unverified inbound events (bad signature -> 401)", async () => {
    const store = new FakeStore();
    const result = await handleResendWebhook({
      rawBody: RECEIVED_BODY,
      headers: { id: "svix_4", timestamp: String(NOW), signature: "v1,invalid" },
      secret: SIGNING_KEY,
      store,
      nowSeconds: NOW,
      fetchReceivedEmail: async () => FETCHED,
    });
    expect(result.status).toBe(401);
    expect(store.ingested).toHaveLength(0);
    expect(store.recorded).toHaveLength(0);
  });
});
