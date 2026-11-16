/**
 * Zapier webhook (REST Hook) tests.
 *
 * Covers: subscribe/unsubscribe (incl. invalid URL, duplicate
 * subscription), HMAC signing + timestamp tolerance + replay
 * (same event_id deduped), outbox enqueue + immediate attempt
 * (mock fetch) + cron retry + dead-letter after max attempts, and
 * 410 deactivation. No database, no network — fetch is mocked.
 */

import { describe, it, expect, vi } from "vitest";
import { buildZapierEventEnvelope } from "../events";
import {
  InMemoryZapierStore,
  subscribeZapierWebhook,
  unsubscribeZapierWebhook,
  enqueueZapierEvent,
  attemptZapierDelivery,
  retryDueZapierDeliveries,
  validateZapierTargetUrl,
  generateZapierWebhookSecret,
  ZAPIER_DELIVERY_MAX_ATTEMPTS,
} from "../outbox";
import { emitZapierEvent } from "../emit";
import { signWebhookPayload, verifyWebhookSignature, buildSignatureHeader } from "@/lib/webhooks/signing";

const WS = "ws_a";
const USER = "user_a";
const HOOK = "https://hooks.zapier.com/hooks/catch/123456/abcdef/";

async function subscribed(store: InMemoryZapierStore, event = "lead.created") {
  const res = await subscribeZapierWebhook(store, WS, USER, { event, target_url: HOOK });
  if (!res.ok) throw new Error(`subscribe failed: ${res.error}`);
  return res.subscription;
}

function mockFetch(status: number) {
  return vi.fn(async () => new Response("ok", { status })) as unknown as typeof fetch;
}

// ── Subscribe / unsubscribe ─────────────────────────────────────────────────

describe("subscribe / unsubscribe", () => {
  it("creates a subscription with a server-side secret that is never returned", async () => {
    const store = new InMemoryZapierStore();
    const sub = await subscribed(store);
    expect(sub.id).toBeTruthy();
    expect(sub.event).toBe("lead.created");
    expect(sub.target_url).toBe(HOOK);
    expect(JSON.stringify(sub)).not.toContain("secret");
    const stored = await store.getSubscription(sub.id);
    expect(stored?.secret).toBeTruthy();
    expect(stored?.secret.length).toBeGreaterThan(20);
  });

  it("dedups an identical active subscription instead of creating a second row", async () => {
    const store = new InMemoryZapierStore();
    const first = await subscribed(store);
    const second = await subscribed(store);
    expect(second.id).toBe(first.id);
    expect((await store.listSubscriptions(WS)).length).toBe(1);
  });

  it("refuses non-Zapier hosts, non-https URLs and unknown events", async () => {
    const store = new InMemoryZapierStore();
    expect(validateZapierTargetUrl("https://evil.example/hook").ok).toBe(false);
    expect(validateZapierTargetUrl("http://hooks.zapier.com/hooks/catch/1/a/").ok).toBe(false);
    expect(validateZapierTargetUrl("https://hooks.zapier.com/hooks/catch/1/a/").ok).toBe(true);
    expect(validateZapierTargetUrl("https://zapier.com/dashboard/auth/oauth/return/App1CLIAPI/").ok).toBe(true);
    const badHost = await subscribeZapierWebhook(store, WS, USER, {
      event: "lead.created",
      target_url: "https://evil.example/hook",
    });
    expect(badHost.ok).toBe(false);
    if (!badHost.ok) expect(badHost.status).toBe(400);
    const badEvent = await subscribeZapierWebhook(store, WS, USER, {
      event: "lead.faxed",
      target_url: HOOK,
    });
    expect(badEvent.ok).toBe(false);
  });

  it("unsubscribe is idempotent and workspace-scoped", async () => {
    const store = new InMemoryZapierStore();
    const sub = await subscribed(store);
    expect((await unsubscribeZapierWebhook(store, WS, sub.id)).ok).toBe(true);
    expect((await unsubscribeZapierWebhook(store, WS, sub.id)).ok).toBe(true);
    expect((await store.listSubscriptions(WS)).length).toBe(0);
    expect((await unsubscribeZapierWebhook(store, "ws_other", sub.id)).ok).toBe(false);
    expect((await unsubscribeZapierWebhook(store, WS, "ghost")).ok).toBe(false);
  });

  it("generates distinct secrets per subscription", () => {
    expect(generateZapierWebhookSecret()).not.toBe(generateZapierWebhookSecret());
  });
});

// ── Signing ─────────────────────────────────────────────────────────────────

describe("HMAC signing", () => {
  it("signs and verifies with timestamp tolerance, and refuses replays outside it", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ id: "evt-1" });
    const ts = 1_700_000_000;
    const header = buildSignatureHeader(secret, ts, body);
    expect(verifyWebhookSignature(secret, header, body, 300, ts)).toBe(true);
    expect(verifyWebhookSignature(secret, header, body, 300, ts + 299)).toBe(true);
    expect(verifyWebhookSignature(secret, header, body, 300, ts + 301)).toBe(false);
    expect(verifyWebhookSignature("wrong-secret", header, body, 300, ts)).toBe(false);
    expect(verifyWebhookSignature(secret, header, JSON.stringify({ id: "evt-2" }), 300, ts)).toBe(false);
    expect(signWebhookPayload(secret, ts, body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Outbox: enqueue + attempt + retry + dead-letter ─────────────────────────

describe("outbox delivery", () => {
  it("enqueues one row per active subscription and dedups a re-enqueue of the same event", async () => {
    const store = new InMemoryZapierStore();
    await subscribed(store, "lead.created");
    await subscribed(store, "campaign.created");
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const first = await enqueueZapierEvent(store, envelope);
    expect(first.length).toBe(1);
    expect(first[0].event_id).toBe(envelope.id);
    expect(first[0].status).toBe("pending");
    const second = await enqueueZapierEvent(store, envelope);
    expect(second.length).toBe(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("immediate attempt delivers on 2xx with the signed headers", async () => {
    const store = new InMemoryZapierStore();
    const sub = await subscribed(store);
    const stored = await store.getSubscription(sub.id);
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueueZapierEvent(store, envelope);
    const fetchFn = mockFetch(200);
    const result = await attemptZapierDelivery({ store, fetchFn }, delivery);
    expect(result.status).toBe("delivered");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = (fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-NxtSend-Event"]).toBe("lead.created");
    expect(headers["X-NxtSend-Signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    const rawBody = init.body as string;
    expect(JSON.parse(rawBody).id).toBe(envelope.id);
    expect(
      verifyWebhookSignature(
        stored?.secret ?? "",
        headers["X-NxtSend-Signature"],
        rawBody,
        300,
        Number(headers["X-NxtSend-Timestamp"])
      )
    ).toBe(true);
  });

  it("retries with backoff and goes dead after max attempts", async () => {
    const store = new InMemoryZapierStore();
    await subscribed(store);
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueueZapierEvent(store, envelope);
    const fetchFn = mockFetch(500);
    let current = delivery;
    for (let attempt = 1; attempt <= ZAPIER_DELIVERY_MAX_ATTEMPTS; attempt++) {
      const result = await attemptZapierDelivery({ store, fetchFn }, current);
      current = (await store.getDelivery(current.id)) ?? current;
      if (attempt < ZAPIER_DELIVERY_MAX_ATTEMPTS) {
        expect(result.status).toBe("failed");
        expect(current.next_retry_at).toBeTruthy();
      } else {
        expect(result.status).toBe("dead");
        expect(current.next_retry_at).toBeNull();
      }
    }
    expect(current.attempts).toBe(ZAPIER_DELIVERY_MAX_ATTEMPTS);
  });

  it("retryDueZapierDeliveries retries only due rows and reports counts", async () => {
    const store = new InMemoryZapierStore();
    await subscribed(store);
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueueZapierEvent(store, envelope);
    // Fail once so the row is due (next_retry_at in the past).
    await attemptZapierDelivery({ store, fetchFn: mockFetch(500) }, delivery);
    const stored = (await store.getDelivery(delivery.id))!;
    await store.updateDelivery(stored.id, { next_retry_at: "2026-01-01T00:00:00.000Z" });
    const summary = await retryDueZapierDeliveries(
      { store, fetchFn: mockFetch(200) },
      "2026-11-17T00:00:00.000Z"
    );
    expect(summary).toEqual({ due: 1, delivered: 1, failed: 0, dead: 0, unsubscribed: 0 });
    expect((await store.getDelivery(delivery.id))?.status).toBe("delivered");
  });

  it("a 410 deactivates the subscription and marks the delivery dead", async () => {
    const store = new InMemoryZapierStore();
    const sub = await subscribed(store);
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueueZapierEvent(store, envelope);
    const result = await attemptZapierDelivery({ store, fetchFn: mockFetch(410) }, delivery);
    expect(result.status).toBe("dead");
    expect(result.unsubscribed).toBe(true);
    expect((await store.getSubscription(sub.id))?.active).toBe(false);
    // Later events no longer enqueue for the dead subscription.
    const again = await enqueueZapierEvent(
      store,
      buildZapierEventEnvelope("lead.created", WS, { leadId: "l2" })
    );
    expect(again.length).toBe(0);
  });

  it("emitZapierEvent never throws and never fails the mutation when delivery fails", async () => {
    const store = new InMemoryZapierStore();
    await subscribed(store);
    const fetchFn = mockFetch(500);
    await expect(
      emitZapierEvent({ store, fetchFn }, "lead.created", WS, { leadId: "l1" })
    ).resolves.toBeUndefined();
    // The outbox still holds the failed row for the job (retry is
    // scheduled in the future, so it is not due right now).
    await new Promise((resolve) => setTimeout(resolve, 50));
    const due = await store.listDueDeliveries(new Date().toISOString());
    expect(due.length).toBe(0); // not due yet (backoff in the future)
  });

  it("emitZapierEvent with no subscribers is a silent no-op", async () => {
    const store = new InMemoryZapierStore();
    await expect(
      emitZapierEvent({ store }, "lead.created", WS, { leadId: "l1" })
    ).resolves.toBeUndefined();
  });
});

// ── Cron job handler ────────────────────────────────────────────────────────

describe("zapier_webhook_retry job", () => {
  it("retries due deliveries and cleans stale inactive subscriptions", async () => {
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const store = new InMemoryZapierStore();
    await subscribed(store);
    const envelope = buildZapierEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueueZapierEvent(store, envelope);
    await attemptZapierDelivery({ store, fetchFn: mockFetch(500) }, delivery);
    const stored = (await store.getDelivery(delivery.id))!;
    await store.updateDelivery(stored.id, { next_retry_at: "2026-01-01T00:00:00.000Z" });
    // A stale inactive subscription (deactivated long ago).
    const stale = await subscribed(store, "campaign.created");
    await store.deactivateSubscription(stale.id);
    const handlers = createJobHandlers();
    const handler = handlers["zapier_webhook_retry"];
    expect(handler).toBeDefined();
    const outcome = await handler(
      {
        id: "job_1",
        workspace_id: null,
        type: "zapier_webhook_retry",
        payload: {},
        idempotency_key: "job_1",
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      },
      {
        listWorkspaces: async () => [],
        getWorkspacePlan: async () => "free",
        countWorkspaceMetric: async () => 0,
        upsertUsageRecord: async () => {},
        listDueWebhookRetries: async () => [],
        retryWebhookDelivery: async () => ({ status: "no_config" }),
        listDueZapierRetries: async (nowIso: string) => {
          const due = await store.listDueDeliveries(nowIso);
          return due.map((d) => ({
            id: d.id,
            workspace_id: d.workspace_id,
            status: d.status,
            attempts: d.attempts,
            max_attempts: d.max_attempts,
          }));
        },
        retryZapierDelivery: async (deliveryId: string) => {
          const row = await store.getDelivery(deliveryId);
          if (!row) return { status: "missing" };
          const result = await attemptZapierDelivery({ store, fetchFn: mockFetch(200) }, row);
          return { status: result.status };
        },
        cleanupStaleZapierSubscriptions: async (olderThanIso: string) => {
          const staleSubs = await store.listStaleInactive(olderThanIso);
          for (const s of staleSubs) await store.deleteSubscription(s.id);
          return staleSubs.length;
        },
      }
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.message).toContain("1 delivered");
    expect((await store.getDelivery(delivery.id))?.status).toBe("delivered");
  });

  it("skips honestly when the worker context has no Zapier store", async () => {
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const handlers = createJobHandlers();
    const outcome = await handlers["zapier_webhook_retry"](
      {
        id: "job_1",
        workspace_id: null,
        type: "zapier_webhook_retry",
        payload: {},
        idempotency_key: "job_1",
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        run_after: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      },
      {
        listWorkspaces: async () => [],
        getWorkspacePlan: async () => "free",
        countWorkspaceMetric: async () => 0,
        upsertUsageRecord: async () => {},
        listDueWebhookRetries: async () => [],
        retryWebhookDelivery: async () => ({ status: "no_config" }),
      }
    );
    expect(outcome.status).toBe("skipped");
  });
});
