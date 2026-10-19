import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createInboxRepository } from "@/lib/data/inbox";
import {
  classifyMessage,
  listMessageHistory,
} from "@/lib/data/message-history";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import type { InboxMessage } from "@/lib/data/inbox";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

function msg(partial: Partial<InboxMessage>): InboxMessage {
  return {
    id: "m1",
    workspace_id: "ws",
    conversation_id: "c1",
    lead_id: null,
    direction: "outbound",
    channel: "email",
    content: "hi",
    status: "sent",
    provider_message_id: null,
    is_demo: false,
    sent_at: "2026-01-01T00:00:00Z",
    read_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as InboxMessage;
}

describe("classifyMessage — simulated is never 'verified'", () => {
  it("provider-confirmed requires a provider id or delivered status", () => {
    expect(classifyMessage(msg({ provider_message_id: "re_123" }))).toBe(
      "provider"
    );
    expect(classifyMessage(msg({ status: "delivered" }))).toBe("provider");
  });

  it("demo-mode outbound sends classify as simulated", () => {
    expect(classifyMessage(msg({ status: "simulated" }))).toBe("simulated");
    // Even a "sent"-looking demo message is simulated, never verified.
    expect(classifyMessage(msg({ status: "sent", is_demo: true }))).toBe(
      "simulated"
    );
  });

  it("failures and suppressions classify as failed", () => {
    expect(classifyMessage(msg({ status: "failed" }))).toBe("failed");
    expect(classifyMessage(msg({ status: "suppressed" }))).toBe("failed");
  });

  it("anything else is merely 'recorded'", () => {
    expect(classifyMessage(msg({ status: "sent" }))).toBe("recorded");
    expect(classifyMessage(msg({ direction: "inbound", status: "received" }))).toBe(
      "recorded"
    );
  });
});

describe("listMessageHistory (demo)", () => {
  it("flattens the demo inbox threads into a labelled history", async () => {
    const repo = createInboxRepository("demo");
    const history = await listMessageHistory(repo, DEMO_WORKSPACE_ID, 100);
    expect(history.length).toBeGreaterThan(0);
    // Every demo-mode outbound entry is simulated — none may claim
    // provider verification.
    for (const entry of history) {
      if (entry.direction === "outbound") {
        expect(entry.verification).toBe("simulated");
      }
      // Subject may be null (LinkedIn threads have none) — the contact
      // identity must always be carried through.
      expect(entry.contact_name.length).toBeGreaterThan(0);
    }
    // Newest first.
    const times = history.map((h) => new Date(h.sent_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
