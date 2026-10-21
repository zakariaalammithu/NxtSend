/**
 * Attachment payload tests (P6 Stage C): a SendEmailInput attachment
 * must reach each provider in its native shape — Resend
 * `attachments`, Gmail multipart/mixed MIME, Graph `fileAttachment` —
 * and must be ABSENT (not an empty array) when no attachment is set,
 * so existing sends are byte-identical to before.
 */

import { describe, it, expect, vi } from "vitest";
import { ResendEmailAdapter, type ResendSender } from "../resend";
import { buildMimeMessage } from "../gmail";
import { buildGraphMessage } from "../microsoft";
import type { PreparedMailboxMessage } from "../mailbox-core";
import type { EmailAttachment, SendEmailInput } from "../types";

const ATTACHMENT: EmailAttachment = {
  filename: "voice-note-2026-10-20.webm",
  contentType: "audio/webm",
  contentBase64: Buffer.from("fake-voice-bytes").toString("base64"),
};

const input: SendEmailInput = {
  workspaceId: "ws_1",
  to: "elena@scalewave.io",
  subject: "Re: Intro",
  text: "Please listen to the attached voice note.",
  attachments: [ATTACHMENT],
};

const prepared: PreparedMailboxMessage = {
  from: "sender@example.com",
  to: "elena@scalewave.io",
  subject: "Re: Intro",
  text: "Please listen to the attached voice note.",
  headers: {},
  attachments: [ATTACHMENT],
};

describe("Resend adapter attachments", () => {
  it("passes attachments to the sender in the documented shape", async () => {
    let seen: unknown = null;
    const sender: ResendSender = {
      send: vi.fn(async (payload) => {
        seen = payload;
        return { id: "msg_1", error: null };
      }),
    };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => false,
      skipMessageRecord: true,
    });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("sent");
    const payload = seen as { attachments?: unknown };
    expect(payload.attachments).toEqual([
      {
        filename: ATTACHMENT.filename,
        content: ATTACHMENT.contentBase64,
        contentType: "audio/webm",
      },
    ]);
  });

  it("omits attachments entirely when the input has none", async () => {
    let seen: Record<string, unknown> | null = null;
    const sender: ResendSender = {
      send: vi.fn(async (payload) => {
        seen = payload as unknown as Record<string, unknown>;
        return { id: "msg_1", error: null };
      }),
    };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => false,
      skipMessageRecord: true,
    });
    const plain: SendEmailInput = { ...input };
    delete plain.attachments;
    await adapter.sendEmail(plain);
    expect(seen!.attachments).toBeUndefined();
  });
});

describe("Gmail MIME attachments", () => {
  it("wraps the body in multipart/mixed with a base64 attachment part", () => {
    const mime = buildMimeMessage(prepared);
    expect(mime).toContain("multipart/mixed");
    expect(mime).toContain(`Content-Type: audio/webm; name="${ATTACHMENT.filename}"`);
    expect(mime).toContain(
      `Content-Disposition: attachment; filename="${ATTACHMENT.filename}"`
    );
    expect(mime).toContain(ATTACHMENT.contentBase64);
    // The text body survives inside the mixed wrapper.
    expect(mime).toContain(
      Buffer.from("Please listen to the attached voice note.", "utf8").toString("base64")
    );
  });

  it("without attachments the message stays single-part (unchanged shape)", () => {
    const plain: PreparedMailboxMessage = { ...prepared };
    delete plain.attachments;
    const mime = buildMimeMessage(plain);
    expect(mime).not.toContain("multipart/mixed");
    expect(mime).not.toContain("Content-Disposition: attachment");
  });
});

describe("Graph message attachments", () => {
  it("adds fileAttachment entries with base64 contentBytes", () => {
    const graph = buildGraphMessage(prepared);
    expect(graph.attachments).toEqual([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: ATTACHMENT.filename,
        contentType: "audio/webm",
        contentBytes: ATTACHMENT.contentBase64,
      },
    ]);
  });

  it("omits the attachments key when there are none", () => {
    const plain: PreparedMailboxMessage = { ...prepared };
    delete plain.attachments;
    const graph = buildGraphMessage(plain);
    expect("attachments" in graph).toBe(false);
  });
});
