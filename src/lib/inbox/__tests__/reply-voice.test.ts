/**
 * Reply-service voice tests (P6 Stage C): a voice note rides the
 * reply as a real adapter attachment and is recorded on the message
 * row; a voice-only reply is allowed (transcript becomes the stored
 * body); empty text WITHOUT a note is still refused; LinkedIn
 * conversations refuse voice exactly like text — no delivery exists.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createInboxRepository, type InboxRepository } from "@/lib/data/inbox";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { sendInboxReply, type ReplyVoiceNote } from "@/lib/inbox/reply";
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
  getState() {
    return "connected" as const;
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return {
      status: "sent",
      provider: "resend",
      providerMessageId: "re_voice_1",
      message: "accepted",
    };
  }
}

const NOTE: ReplyVoiceNote = {
  path: "data:audio/webm;base64,ZmFrZS1hdWRpbw==",
  durationSec: 17,
  language: "en-US",
  transcript: "Hi Elena, quick voice update on Thursday.",
  attachment: {
    filename: "voice-note.webm",
    contentType: "audio/webm",
    contentBase64: "ZmFrZS1hdWRpbw==",
  },
};

async function emailConversation(repo: InboxRepository) {
  const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
  return conversations.find((c) => c.contact_email === "elena@scalewave.io")!;
}
async function linkedinConversation(repo: InboxRepository) {
  const { conversations } = await repo.listConversations(DEMO_WORKSPACE_ID);
  return conversations.find((c) => c.channel === "linkedin")!;
}

describe("sendInboxReply with a voice note", () => {
  it("passes the attachment to the adapter and stores the voice fields", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter();
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "Sending you a voice note instead of a wall of text.",
        idempotencyKey: "k-voice-1",
        voiceNote: NOTE,
      }
    );
    expect(outcome.ok).toBe(true);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0].attachments).toEqual([NOTE.attachment]);
    if (outcome.ok) {
      expect(outcome.message.voice_note_path).toBe(NOTE.path);
      expect(outcome.message.voice_note_duration_sec).toBe(17);
      expect(outcome.message.voice_note_language).toBe("en-US");
      expect(outcome.message.transcript).toBe(NOTE.transcript);
      expect(outcome.message.status).toBe("sent");
    }
  });

  it("allows a voice-only reply: transcript becomes the stored body, email text explains the attachment", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter();
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "",
        idempotencyKey: "k-voice-only",
        voiceNote: NOTE,
      }
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.message.content).toBe(NOTE.transcript);
    }
    expect(adapter.calls[0].text).toMatch(/voice note/i);
    expect(adapter.calls[0].attachments).toEqual([NOTE.attachment]);
  });

  it("still refuses empty content when no voice note is attached", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter();
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "   ",
        idempotencyKey: "k-empty",
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("empty_content");
    expect(adapter.calls).toHaveLength(0);
  });

  it("LinkedIn conversations refuse voice replies exactly like text (no adapter or DB touch)", async () => {
    const repo = createInboxRepository("demo");
    const conv = await linkedinConversation(repo);
    const adapter = new FakeAdapter();
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "",
        idempotencyKey: "k-linkedin-voice",
        voiceNote: NOTE,
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("linkedin_unavailable");
    expect(adapter.calls).toHaveLength(0);
  });

  it("a text-only reply carries no attachments and no voice fields (unchanged behaviour)", async () => {
    const repo = createInboxRepository("demo");
    const conv = await emailConversation(repo);
    const adapter = new FakeAdapter();
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: DEMO_WORKSPACE_ID,
        conversationId: conv.id,
        content: "Plain text reply.",
        idempotencyKey: "k-plain",
      }
    );
    expect(outcome.ok).toBe(true);
    expect(adapter.calls[0].attachments).toBeUndefined();
    if (outcome.ok) {
      expect(outcome.message.voice_note_path ?? null).toBeNull();
    }
  });
});
