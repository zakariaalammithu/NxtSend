import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createInboxRepository, type InboxRepository } from "@/lib/data/inbox";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { sendInboxReply } from "@/lib/inbox/reply";
import { ResendEmailAdapter, type ResendSender } from "@/lib/email/resend";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

class FakeAdapter implements EmailProviderAdapter {
  readonly provider = "resend";
  calls: SendEmailInput[] = [];
  constructor(private results: SendEmailResult[]) {}
  getState() {
    return "connected" as const;
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return this.results[Math.min(this.calls.length - 1, this.results.length - 1)];
  }
}

const SENT: SendEmailResult = {
  status: "sent",
  provider: "resend",
  providerMessageId: "re_msg_123",
  message: "accepted",
};
const SIMULATED: SendEmailResult = {
  status: "simulated",
  provider: "resend",
  providerMessageId: null,
  message: "simulated",
};
const FAILED: SendEmailResult = {
  status: "error",
  provider: "resend",
  providerMessageId: null,
  message: "Resend rejected the send: domain not verified",
};
const NOT_CONFIGURED: SendEmailResult = {
  status: "not_configured",
  provider: "resend",
  providerMessageId: null,
  message: "Resend is not configured",
};

async function emailConversation(repo: InboxRepository) {
  const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
  return conversations.find((c) => c.contact_email === "elena@scalewave.io")!;
}
async function linkedinConversation(repo: InboxRepository) {
  const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
  return conversations.find((c) => c.channel === "linkedin")!;
}

describe("sendInboxReply", () => {
  it("persists the provider outcome: sent only with a provider message ID", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter([SENT]);
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "Thursday works — sending a calendar invite now.",
        idempotencyKey: "k-sent",
      }
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.message.status).toBe("sent");
      expect(outcome.message.provider_message_id).toBe("re_msg_123");
      expect(outcome.message.subject).toContain("Re:");
    }
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0].to).toBe("elena@scalewave.io");
    const thread = await repo.getThread(DEMO_WORKSPACE_ID, conv.id);
    expect(
      thread!.messages.some(
        (m) => m.idempotency_key === "k-sent" && m.status === "sent"
      )
    ).toBe(true);
  });

  describe("reply routing (P5 Stage C)", () => {
    afterEach(() => {
      delete process.env.EMAIL_REPLY_TO;
    });

    it("passes EMAIL_REPLY_TO as replyTo when set; unset leaves it undefined", async () => {
      const repo = createInboxRepository("demo");
      const conv = await emailConversation(repo);

      process.env.EMAIL_REPLY_TO = "replies@reply.example.com";
      const withReplyTo = new FakeAdapter([SENT]);
      await sendInboxReply(
        { repo, adapter: withReplyTo },
        {
          workspaceId: DEMO_WORKSPACE_ID,
          conversationId: conv.id,
          content: "with routing",
          idempotencyKey: "k-replyto-1",
        }
      );
      expect(withReplyTo.calls[0].replyTo).toBe("replies@reply.example.com");

      delete process.env.EMAIL_REPLY_TO;
      const without = new FakeAdapter([SENT]);
      await sendInboxReply(
        { repo, adapter: without },
        {
          workspaceId: DEMO_WORKSPACE_ID,
          conversationId: conv.id,
          content: "without routing",
          idempotencyKey: "k-replyto-2",
        }
      );
      expect(without.calls[0].replyTo).toBeUndefined();
    });
  });

  it("marks demo sends as simulated, never delivered", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const outcome = await sendInboxReply(
      { repo, adapter: new FakeAdapter([SIMULATED]) },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "demo reply",
        idempotencyKey: "k-sim",
      }
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.message.status).toBe("simulated");
      expect(outcome.message.provider_message_id).toBeNull();
    }
  });

  it("is idempotent: a retry after success returns the same row and never re-sends", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter([SENT]);
    const args = {
      workspaceId: DEMO_WORKSPACE_ID,
      conversationId: conv.id,
      content: "same draft",
      idempotencyKey: "k-dup",
    };
    const first = await sendInboxReply({ repo, adapter }, args);
    const second = await sendInboxReply({ repo, adapter }, args);
    expect(adapter.calls).toHaveLength(1);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.duplicate).toBe(true);
      expect(second.message.id).toBe(first.message.id);
    }
  });

  it("persists failures with the provider error and retries on the SAME row", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter([FAILED, SENT]);
    const args = {
      workspaceId: DEMO_WORKSPACE_ID,
      conversationId: conv.id,
      content: "retry me",
      idempotencyKey: "k-retry",
    };
    const first = await sendInboxReply({ repo, adapter }, args);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.code).toBe("provider_error");
      expect(first.message?.status).toBe("failed");
      expect(first.message?.error).toContain("domain not verified");
    }
    const second = await sendInboxReply({ repo, adapter }, args);
    expect(second.ok).toBe(true);
    if (first.ok === false && second.ok) {
      expect(second.message.id).toBe(first.message!.id);
      expect(second.message.status).toBe("sent");
    }
    const thread = await repo.getThread(DEMO_WORKSPACE_ID, conv.id);
    expect(
      thread!.messages.filter((m) => m.idempotency_key === "k-retry")
    ).toHaveLength(1);
  });

  it("enforces suppression in the reply path (real adapter, suppressed recipient)", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const sender: ResendSender = {
      send: vi.fn(async () => ({ id: "should_never_happen", error: null })),
    };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => true,
      adminClient: null,
      skipMessageRecord: true,
    });
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "please stop emailing me — oh wait",
        idempotencyKey: "k-supp",
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("suppressed");
      expect(outcome.message?.status).toBe("suppressed");
    }
    // The provider was never called — suppression runs first.
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("persists not_configured as failed with the honest adapter message", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const outcome = await sendInboxReply(
      { repo, adapter: new FakeAdapter([NOT_CONFIGURED]) },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "hello",
        idempotencyKey: "k-nc",
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("not_configured");
      expect(outcome.message?.status).toBe("failed");
      expect(outcome.message?.error).toContain("not configured");
    }
  });

  it("refuses LinkedIn replies before touching the adapter or the database", async () => {
    const repo = createInboxRepository("demo");
    const conv = await linkedinConversation(repo);
    const adapter = new FakeAdapter([SENT]);
    const before = await repo.getThread(DEMO_WORKSPACE_ID, conv.id);
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "hi via linkedin",
        idempotencyKey: "k-li",
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("linkedin_unavailable");
    expect(adapter.calls).toHaveLength(0);
    const after = await repo.getThread(DEMO_WORKSPACE_ID, conv.id);
    expect(after!.messages).toHaveLength(before!.messages.length);
  });

  it("validates content, idempotency key, conversation and tenant", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter([SENT]);

    const empty = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "   ",
        idempotencyKey: "k1",
      }
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("empty_content");

    const noKey = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "hi",
        idempotencyKey: "",
      }
    );
    expect(noKey.ok).toBe(false);
    if (!noKey.ok) expect(noKey.code).toBe("missing_idempotency_key");

    const missing = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: "conv_does_not_exist",
        content: "hi",
        idempotencyKey: "k2",
      }
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("not_found");

    const wrongTenant = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: "ws_someone_else",
        conversationId: conv.id,
        content: "hi",
        idempotencyKey: "k3",
      }
    );
    expect(wrongTenant.ok).toBe(false);
    if (!wrongTenant.ok) expect(wrongTenant.code).toBe("not_found");
    expect(adapter.calls).toHaveLength(0);
  });
});
