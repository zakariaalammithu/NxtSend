import { describe, it, expect, vi } from "vitest";
import { createHmac, randomBytes } from "crypto";
import { getEmailState, isResendWebhookConfigured } from "../state";
import { isSuppressed } from "../suppression";
import { ResendEmailAdapter, type ResendSender } from "../resend";
import {
  signSvixPayload,
  verifySvixSignature,
  handleResendWebhook,
  type EmailEventStore,
} from "../webhook";

// ── State derivation ────────────────────────────────────────────────────────

describe("getEmailState", () => {
  it("is demo in demo data mode regardless of keys", () => {
    expect(
      getEmailState({ RESEND_API_KEY: "re_real", EMAIL_FROM: "a@b.co" }, "demo")
    ).toBe("demo");
  });

  it("is not_connected with nothing set (live mode)", () => {
    expect(getEmailState({}, "supabase")).toBe("not_connected");
  });

  it("is configuration_required with only one of key/from", () => {
    expect(getEmailState({ RESEND_API_KEY: "re_real" }, "supabase")).toBe(
      "configuration_required"
    );
    expect(getEmailState({ EMAIL_FROM: "hello@nxtsend.com" }, "supabase")).toBe(
      "configuration_required"
    );
  });

  it("is connected only with a plausible key AND a from address", () => {
    expect(
      getEmailState(
        { RESEND_API_KEY: "re_9f8e7d6c", EMAIL_FROM: "NxtSend <hello@nxtsend.com>" },
        "supabase"
      )
    ).toBe("connected");
  });

  it("treats the .env.example placeholders as NOT configured", () => {
    expect(
      getEmailState(
        { RESEND_API_KEY: "re_your_resend_api_key", EMAIL_FROM: "hello@nxtsend.com" },
        "supabase"
      )
    ).toBe("configuration_required");
  });

  it("webhook readiness follows the signing secret", () => {
    expect(isResendWebhookConfigured({ RESEND_WEBHOOK_SECRET: "whsec_your_x" })).toBe(false);
    expect(isResendWebhookConfigured({ RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(8).toString("base64")}` })).toBe(true);
    expect(isResendWebhookConfigured({})).toBe(false);
  });
});

// ── Suppression matcher ─────────────────────────────────────────────────────

describe("isSuppressed", () => {
  it("matches case-insensitively and trims", () => {
    expect(isSuppressed(["Boss@Example.com"], " boss@example.com ")).toBe(true);
  });
  it("does not match other addresses", () => {
    expect(isSuppressed(["a@x.co"], "b@x.co")).toBe(false);
  });
  it("handles an empty list / empty email", () => {
    expect(isSuppressed([], "a@x.co")).toBe(false);
    expect(isSuppressed(["a@x.co"], "")).toBe(false);
  });
});

// ── Adapter behaviour ───────────────────────────────────────────────────────

describe("ResendEmailAdapter", () => {
  const input = {
    workspaceId: "ws_1",
    to: "lead@example.com",
    subject: "Hi",
    text: "Hello",
  };

  it("in demo state returns a simulated result and never calls the sender", async () => {
    const sender: ResendSender = { send: vi.fn(async () => ({ id: "x", error: null })) };
    const adapter = new ResendEmailAdapter({ sender, stateOverride: "demo" });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("simulated");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("in not_configured state refuses without calling the sender", async () => {
    const sender: ResendSender = { send: vi.fn(async () => ({ id: "x", error: null })) };
    const adapter = new ResendEmailAdapter({ sender, stateOverride: "not_connected" });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("not_configured");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("checks suppression BEFORE sending and refuses suppressed recipients", async () => {
    const sender: ResendSender = { send: vi.fn(async () => ({ id: "msg_1", error: null })) };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => true,
    });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("suppressed");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("fails closed when the suppression check itself errors", async () => {
    const sender: ResendSender = { send: vi.fn(async () => ({ id: "msg_1", error: null })) };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => {
        throw new Error("db down");
      },
    });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("error");
    expect(result.message).toContain("suppression check failed");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("only reports sent when the provider returns a message ID", async () => {
    const sender: ResendSender = { send: vi.fn(async () => ({ id: "msg_42", error: null })) };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => false,
      adminClient: null,
    });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("sent");
    if (result.status === "sent") expect(result.providerMessageId).toBe("msg_42");
  });

  it("reports provider rejection as error, never as sent", async () => {
    const sender: ResendSender = {
      send: vi.fn(async () => ({ id: null, error: "validation_error: bad from" })),
    };
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      suppressionCheck: async () => false,
      adminClient: null,
    });
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("error");
  });
});

// ── Svix webhook verification + handling ────────────────────────────────────

const TEST_SECRET = `whsec_${randomBytes(32).toString("base64")}`;

function signedHeaders(secret: string, id: string, ts: number, body: string) {
  return {
    id,
    timestamp: String(ts),
    signature: `v1,${signSvixPayload(secret, id, ts, body)}`,
  };
}

class FakeEmailStore implements EmailEventStore {
  events = new Map<string, unknown>();
  statuses = new Map<string, string>();
  suppressions: Array<{ workspaceId: string; email: string; reason: string }> = [];
  async hasEvent(id: string) {
    return this.events.has(id);
  }
  async recordEvent(evt: { providerEventId: string }) {
    this.events.set(evt.providerEventId, evt);
  }
  async updateMessageStatus(id: string, status: string) {
    this.statuses.set(id, status);
  }
  async getMessageWorkspace() {
    return "ws_1";
  }
  async addSuppression(workspaceId: string, email: string, reason: string) {
    this.suppressions.push({ workspaceId, email, reason });
  }
}

describe("adapter unsubscribe preparation (P5 Stage C)", () => {
  const unsubEnv = {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
    UNSUBSCRIBE_SECRET: "adapter-test-secret-0123456789abcdef",
    EMAIL_REPLY_TO: "replies@reply.example.com",
  };

  function capturingSender() {
    const sent: Array<Parameters<ResendSender["send"]>[0]> = [];
    const sender: ResendSender = {
      async send(payload) {
        sent.push(payload);
        return { id: "msg_headers", error: null };
      },
    };
    return { sender, sent };
  }

  it("connected sends carry List-Unsubscribe (+ One-Click) headers and a footer; the caller's body is not mutated", async () => {
    const { sender, sent } = capturingSender();
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      adminClient: null,
      suppressionCheck: async () => false,
      unsubscribeEnv: unsubEnv,
    });
    const input = {
      workspaceId: "ws_1",
      from: "sender@example.com",
      to: "lead@example.com",
      subject: "Hello",
      text: "Original body",
    };
    const result = await adapter.sendEmail(input);
    expect(result.status).toBe("sent");
    expect(sent).toHaveLength(1);
    const payload = sent[0];
    expect(payload.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    expect(payload.headers?.["List-Unsubscribe"]).toContain(
      "<mailto:replies@reply.example.com>"
    );
    expect(payload.headers?.["List-Unsubscribe"]).toMatch(
      /<https:\/\/app\.nxtsend\.example\/api\/unsubscribe\/[^>]+>/
    );
    expect(payload.text).toContain("Original body");
    expect(payload.text).toMatch(
      /Unsubscribe: https:\/\/app\.nxtsend\.example\/api\/unsubscribe\//
    );
    // The stored/caller body is never mutated by the send-time append.
    expect(input.text).toBe("Original body");
  });

  it("suppress → the send is refused as suppressed; remove → the send is allowed (fixture sender)", async () => {
    const suppressed = new Set<string>();
    const { sender, sent } = capturingSender();
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      adminClient: null,
      suppressionCheck: async (_ws, email) => suppressed.has(email),
      unsubscribeEnv: unsubEnv,
    });
    const input = {
      workspaceId: "ws_1",
      from: "sender@example.com",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    };

    suppressed.add("lead@example.com");
    const blocked = await adapter.sendEmail(input);
    expect(blocked.status).toBe("suppressed");
    expect(sent).toHaveLength(0); // provider never called

    suppressed.delete("lead@example.com");
    const allowed = await adapter.sendEmail(input);
    expect(allowed.status).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  it("caller-supplied headers are merged, and List-* from the prep win", async () => {
    const { sender, sent } = capturingSender();
    const adapter = new ResendEmailAdapter({
      sender,
      stateOverride: "connected",
      adminClient: null,
      suppressionCheck: async () => false,
      unsubscribeEnv: unsubEnv,
    });
    await adapter.sendEmail({
      workspaceId: "ws_1",
      from: "sender@example.com",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
      headers: {
        "X-Campaign": "camp_1",
        "List-Unsubscribe": "<mailto:fake@example.com>",
      },
    });
    expect(sent[0].headers?.["X-Campaign"]).toBe("camp_1");
    expect(sent[0].headers?.["List-Unsubscribe"]).not.toContain(
      "fake@example.com"
    );
  });
});

describe("verifySvixSignature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } });
  const now = 1_760_000_000;

  it("accepts a correctly signed payload (documented svix scheme)", () => {
    const headers = signedHeaders(TEST_SECRET, "msg_1", now, body);
    // Cross-check the signer against a hand-computed HMAC per the docs.
    const key = Buffer.from(TEST_SECRET.slice("whsec_".length), "base64");
    const manual = createHmac("sha256", key)
      .update(`msg_1.${now}.${body}`)
      .digest("base64");
    expect(headers.signature).toBe(`v1,${manual}`);
    expect(verifySvixSignature(TEST_SECRET, headers, body, now).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const headers = signedHeaders(TEST_SECRET, "msg_1", now, body);
    expect(verifySvixSignature(TEST_SECRET, headers, body + " ", now).ok).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    const other = `whsec_${randomBytes(32).toString("base64")}`;
    const headers = signedHeaders(other, "msg_1", now, body);
    expect(verifySvixSignature(TEST_SECRET, headers, body, now).ok).toBe(false);
  });

  it("rejects stale timestamps (replay window)", () => {
    const headers = signedHeaders(TEST_SECRET, "msg_1", now - 3600, body);
    expect(verifySvixSignature(TEST_SECRET, headers, body, now).ok).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifySvixSignature(TEST_SECRET, { id: null, timestamp: null, signature: null }, body, now).ok
    ).toBe(false);
  });
});

describe("handleResendWebhook", () => {
  const now = 1_760_000_000;
  const deliveredBody = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "msg_9", to: ["lead@example.com"] },
  });

  it("rejects with 503 when the signing secret is unset", async () => {
    const result = await handleResendWebhook({
      rawBody: deliveredBody,
      headers: signedHeaders(TEST_SECRET, "evt_1", now, deliveredBody),
      secret: undefined,
      store: new FakeEmailStore(),
      nowSeconds: now,
    });
    expect(result.status).toBe(503);
  });

  it("rejects with 401 on a bad signature", async () => {
    const result = await handleResendWebhook({
      rawBody: deliveredBody,
      headers: { id: "evt_1", timestamp: String(now), signature: "v1,AAAA" },
      secret: TEST_SECRET,
      store: new FakeEmailStore(),
      nowSeconds: now,
    });
    expect(result.status).toBe(401);
  });

  it("applies a verified delivered event and dedupes redelivery", async () => {
    const store = new FakeEmailStore();
    const headers = signedHeaders(TEST_SECRET, "evt_1", now, deliveredBody);
    const first = await handleResendWebhook({
      rawBody: deliveredBody,
      headers,
      secret: TEST_SECRET,
      store,
      nowSeconds: now,
    });
    expect(first.status).toBe(200);
    expect(store.statuses.get("msg_9")).toBe("delivered");

    const second = await handleResendWebhook({
      rawBody: deliveredBody,
      headers,
      secret: TEST_SECRET,
      store,
      nowSeconds: now,
    });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  it("suppresses the recipient on a verified bounce", async () => {
    const bounceBody = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "msg_10", to: ["gone@example.com"] },
    });
    const store = new FakeEmailStore();
    const result = await handleResendWebhook({
      rawBody: bounceBody,
      headers: signedHeaders(TEST_SECRET, "evt_2", now, bounceBody),
      secret: TEST_SECRET,
      store,
      nowSeconds: now,
    });
    expect(result.status).toBe(200);
    expect(store.statuses.get("msg_10")).toBe("bounced");
    expect(store.suppressions).toEqual([
      { workspaceId: "ws_1", email: "gone@example.com", reason: "bounced (Resend webhook)" },
    ]);
  });
});
