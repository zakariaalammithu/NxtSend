import { describe, it, expect, vi } from "vitest";
import {
  signWebhookPayload,
  buildSignatureHeader,
  verifyWebhookSignature,
} from "../signing";
import { buildEventEnvelope, isWebhookEventType } from "../events";
import {
  parseWebhookConfig,
  publicWebhookConfig,
  getWebhookState,
  validateWebhookUrl,
} from "../config";
import {
  InMemoryWebhookStore,
  dispatchEvent,
  runDeliveryAttempt,
  nextRetryDelayMs,
  type WebhookDelivery,
} from "../dispatch";
import type { WebhookConfig } from "../config";

const SECRET = "whsec_test_signing_secret";

// ── HMAC signing ────────────────────────────────────────────────────────────

describe("webhook signing", () => {
  const body = JSON.stringify({ type: "lead.created", data: { leadId: "l1" } });
  const now = 1_760_000_000;

  it("signs as hex HMAC-SHA256 over `${ts}.${body}` and verifies", () => {
    const header = buildSignatureHeader(SECRET, now, body);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(header).toContain(signWebhookPayload(SECRET, now, body));
    expect(verifyWebhookSignature(SECRET, header, body, 300, now)).toBe(true);
  });

  it("rejects a tampered payload and a wrong secret", () => {
    const header = buildSignatureHeader(SECRET, now, body);
    expect(verifyWebhookSignature(SECRET, header, body.replace("l1", "l2"), 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", header, body, 300, now)).toBe(false);
  });

  it("rejects stale timestamps and malformed headers", () => {
    const header = buildSignatureHeader(SECRET, now, body);
    expect(verifyWebhookSignature(SECRET, header, body, 300, now + 10_000)).toBe(false);
    expect(verifyWebhookSignature(SECRET, null, body)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "garbage", body)).toBe(false);
  });
});

// ── Envelope + config ───────────────────────────────────────────────────────

describe("event envelope", () => {
  it("has the stable documented shape", () => {
    const env = buildEventEnvelope("lead.created", "ws_1", { leadId: "l1" });
    expect(env.type).toBe("lead.created");
    expect(env.workspace_id).toBe("ws_1");
    expect(env.data).toEqual({ leadId: "l1" });
    expect(env.id).toBeTruthy();
    expect(() => new Date(env.created_at).toISOString()).not.toThrow();
    expect(isWebhookEventType("lead.created")).toBe(true);
    expect(isWebhookEventType("lead.deleted")).toBe(false);
  });
});

describe("webhook config", () => {
  it("parses stored config and defaults the event filter to all events", () => {
    const config = parseWebhookConfig({ url: "https://n8n.example.com/hook", secret: "whsec_x" });
    expect(config?.events).toHaveLength(3);
    expect(config?.enabled).toBe(true);
  });

  it("never exposes the secret in the public view", () => {
    const config = parseWebhookConfig({
      url: "https://n8n.example.com/hook",
      secret: "whsec_super_secret_value",
      events: ["lead.created"],
    });
    const pub = publicWebhookConfig(config);
    expect(pub.hasSecret).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("whsec_super_secret_value");
  });

  it("derives state from mode + config completeness", () => {
    expect(getWebhookState(null, "supabase")).toBe("not_connected");
    expect(
      getWebhookState({ url: "https://x.co", secret: "", events: [], enabled: true }, "supabase")
    ).toBe("configuration_required");
    expect(
      getWebhookState(
        { url: "https://x.co", secret: "whsec_real", events: [], enabled: true },
        "supabase"
      )
    ).toBe("connected");
    expect(getWebhookState(null, "demo")).toBe("demo");
  });

  it("validates URLs: https required, localhost http allowed", () => {
    expect(validateWebhookUrl("https://hooks.zapier.com/abc").ok).toBe(true);
    expect(validateWebhookUrl("http://localhost:5678/webhook/x").ok).toBe(true);
    expect(validateWebhookUrl("http://evil.example.com/x").ok).toBe(false);
    expect(validateWebhookUrl("not a url").ok).toBe(false);
  });
});

// ── Dispatch + delivery log + retry ─────────────────────────────────────────

const CONFIG: WebhookConfig = {
  url: "https://n8n.example.com/webhook/nxtsend",
  secret: SECRET,
  events: ["lead.created", "campaign.created", "campaign.status_changed"],
  enabled: true,
};

function okFetch() {
  return vi.fn(async () => ({ status: 200 }) as Response);
}
function failFetch() {
  return vi.fn(async () => ({ status: 500 }) as Response);
}

describe("dispatchEvent", () => {
  it("delivers with a signed request and records the delivery", async () => {
    const store = new InMemoryWebhookStore();
    const fetchFn = okFetch();
    const envelope = buildEventEnvelope("lead.created", "ws_1", { leadId: "l1" });
    const delivery = await dispatchEvent({ store, fetchFn }, CONFIG, envelope);
    expect(delivery.status).toBe("delivered");
    expect(delivery.attempts).toBe(1);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CONFIG.url);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-NxtSend-Event"]).toBe("lead.created");
    // The signature verifies against the exact body that was sent.
    expect(
      verifyWebhookSignature(SECRET, headers["X-NxtSend-Signature"], init.body as string)
    ).toBe(true);
  });

  it("in simulated mode records 'simulated' and never calls out", async () => {
    const store = new InMemoryWebhookStore();
    const fetchFn = okFetch();
    const envelope = buildEventEnvelope("campaign.created", "ws_1", {});
    const delivery = await dispatchEvent(
      { store, fetchFn, simulated: true },
      CONFIG,
      envelope
    );
    expect(delivery.status).toBe("simulated");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("records failures with a retry schedule, then succeeds on retry", async () => {
    const store = new InMemoryWebhookStore();
    const envelope = buildEventEnvelope("lead.created", "ws_1", {});
    const first = await dispatchEvent({ store, fetchFn: failFetch() }, CONFIG, envelope);
    expect(first.status).toBe("failed");
    expect(first.last_error).toContain("HTTP 500");
    expect(first.next_retry_at).not.toBeNull();

    const retried = await runDeliveryAttempt({ store, fetchFn: okFetch() }, CONFIG, first);
    expect(retried.status).toBe("delivered");
    expect(retried.attempts).toBe(2);
    expect(retried.next_retry_at).toBeNull();
  });

  it("stops scheduling retries at the attempts cap", async () => {
    const store = new InMemoryWebhookStore();
    const envelope = buildEventEnvelope("lead.created", "ws_1", {});
    let delivery: WebhookDelivery = await dispatchEvent(
      { store, fetchFn: failFetch() },
      CONFIG,
      envelope
    );
    delivery = await runDeliveryAttempt({ store, fetchFn: failFetch() }, CONFIG, delivery);
    delivery = await runDeliveryAttempt({ store, fetchFn: failFetch() }, CONFIG, delivery);
    expect(delivery.attempts).toBe(3);
    expect(delivery.next_retry_at).toBeNull();
    // And the due-retry query no longer returns it.
    const due = await store.listDueRetries(new Date(Date.now() + 86_400_000).toISOString());
    expect(due.find((d) => d.id === delivery.id)).toBeUndefined();
    expect(nextRetryDelayMs(99)).toBeNull();
  });
});
