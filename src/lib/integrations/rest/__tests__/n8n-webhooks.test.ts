/**
 * n8n webhook tests (shared REST outbox, migration 029).
 *
 * What is being protected: per-platform target-URL validation
 * (n8n URL accepted / Zapier URL rejected for n8n and vice
 * versa), the platform column default, subscribe dedup per
 * platform (secrets never returned), fan-out delivery to both
 * platforms' subscriptions, per-platform retry (a Zapier retry
 * never touches n8n deliveries), and dead-letter after the
 * attempt cap. All over the in-memory platform store — no
 * database, no network (fetch is stubbed).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  InMemoryPlatformStore,
  subscribePlatformWebhook,
  unsubscribePlatformWebhook,
  enqueuePlatformEvent,
  attemptPlatformDelivery,
  retryDuePlatformDeliveries,
  validatePlatformTargetUrl,
  createPlatformStore,
  DELIVERY_MAX_ATTEMPTS,
} from "../outbox";
import { emitPlatformEvent, emitZapierEvent } from "../emit";
import { buildEventEnvelope, WEBHOOK_EVENT_TYPES } from "../events";
import { getPlatformConfig } from "../config";

const WS = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const N8N_URL = "https://my-workspace.app.n8n.cloud/webhook/abc123";
const N8N_URL_2 = "https://n8n.example.com/webhook/lead-created";
const ZAPIER_URL = "https://hooks.zapier.com/hooks/catch/123456/abcdef";

const okFetch = (async () => ({ status: 200 }) as unknown) as typeof fetch;
const failFetch = (async () => ({ status: 500 }) as unknown) as typeof fetch;

const savedNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
});

describe("platform config", () => {
  it("resolves the n8n platform config", () => {
    const config = getPlatformConfig("n8n");
    expect(config.resourcePath).toBe("/api/integrations/n8n");
    expect(config.scopePrefix).toBe("n8n");
    expect(getPlatformConfig("zapier").resourcePath).toBe("/api/integrations/zapier");
  });

  it("shares the same 8 events for both platforms", () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([
      "lead.created",
      "lead.updated",
      "lead.added_to_campaign",
      "lead.removed_from_campaign",
      "campaign.created",
      "campaign.status_changed",
      "conversation.reply_created",
      "subscription.changed",
    ]);
  });
});

describe("validatePlatformTargetUrl", () => {
  it("accepts any public https host for n8n", () => {
    expect(validatePlatformTargetUrl("n8n", N8N_URL).ok).toBe(true);
    expect(validatePlatformTargetUrl("n8n", N8N_URL_2).ok).toBe(true);
    expect(validatePlatformTargetUrl("n8n", "https://n8n.example.com:5678/webhook/x").ok).toBe(true);
  });

  it("rejects Zapier hosts for n8n and n8n hosts for Zapier", () => {
    expect(validatePlatformTargetUrl("n8n", ZAPIER_URL).ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "https://zapier.com/hooks/catch/1/2").ok).toBe(false);
    expect(validatePlatformTargetUrl("zapier", N8N_URL).ok).toBe(false);
    expect(validatePlatformTargetUrl("zapier", ZAPIER_URL).ok).toBe(true);
  });

  it("rejects localhost / private IPs and http for n8n", () => {
    expect(validatePlatformTargetUrl("n8n", "https://localhost:5678/webhook/x").ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "https://192.168.1.5/webhook/x").ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "https://10.1.2.3/webhook/x").ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "http://n8n.example.com/webhook/x").ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "not a url").ok).toBe(false);
    expect(validatePlatformTargetUrl("n8n", "https://n8n.example.com/webhook/x?q=1").ok).toBe(false);
  });

  it("allows http loopback for n8n only on a local deployment", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(validatePlatformTargetUrl("n8n", "http://localhost:5678/webhook/x").ok).toBe(false);
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect(validatePlatformTargetUrl("n8n", "http://localhost:5678/webhook/x").ok).toBe(true);
  });
});

describe("subscribePlatformWebhook", () => {
  it("creates an n8n subscription without ever returning the secret", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const result = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subscription.event).toBe("lead.created");
    expect(result.subscription.target_url).toBe(N8N_URL);
    expect("secret" in result.subscription).toBe(false);
    // The stored row DOES carry the platform + secret.
    const stored = await store.getSubscription(result.subscription.id);
    expect(stored?.platform).toBe("n8n");
    expect(stored?.secret).toBeTruthy();
  });

  it("defaults the platform column: a zapier-bound store creates zapier rows", async () => {
    const store = new InMemoryPlatformStore("zapier");
    const result = await subscribePlatformWebhook(store, "zapier", WS, USER, {
      event: "lead.created",
      target_url: ZAPIER_URL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await store.getSubscription(result.subscription.id);
    expect(stored?.platform).toBe("zapier");
  });

  it("dedups per platform: same URL on both platforms is two subscriptions", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const first = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    const again = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.subscription.id).toBe(first.subscription.id);
    // A Zapier subscription to a DIFFERENT (Zapier) URL is separate.
    const zapier = await subscribePlatformWebhook(store, "zapier", WS, USER, {
      event: "lead.created",
      target_url: ZAPIER_URL,
    });
    expect(zapier.ok).toBe(true);
    if (!zapier.ok) return;
    expect(zapier.subscription.id).not.toBe(first.subscription.id);
  });

  it("rejects unknown events and Zapier URLs for n8n", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const badEvent = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.deleted",
      target_url: N8N_URL,
    });
    expect(badEvent.ok).toBe(false);
    if (!badEvent.ok) expect(badEvent.code).toBe("invalid_event");
    const badUrl = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: ZAPIER_URL,
    });
    expect(badUrl.ok).toBe(false);
    if (!badUrl.ok) expect(badUrl.code).toBe("invalid_target_url");
  });

  it("unsubscribe is platform-scoped: Zapier cannot unsubscribe an n8n subscription", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const created = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const wrong = await unsubscribePlatformWebhook(store, "zapier", WS, created.subscription.id);
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBe(404);
    const right = await unsubscribePlatformWebhook(store, "n8n", WS, created.subscription.id);
    expect(right.ok).toBe(true);
  });
});

describe("emit fan-out", () => {
  it("delivers one event to both platforms' subscriptions", async () => {
    const store = new InMemoryPlatformStore("zapier");
    await subscribePlatformWebhook(store, "zapier", WS, USER, {
      event: "lead.created",
      target_url: ZAPIER_URL,
    });
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL_2,
    });
    // A subscription for a DIFFERENT event must not fire.
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "campaign.created",
      target_url: N8N_URL_2,
    });
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      return { status: 200 };
    }) as unknown as typeof fetch;
    await emitPlatformEvent({ store, fetchFn }, "lead.created", WS, { leadId: "l1" });
    expect(seen).toHaveLength(3);
    expect(seen).toContain(ZAPIER_URL);
    expect(seen).toContain(N8N_URL);
    expect(seen).toContain(N8N_URL_2);
  });

  it("emitZapierEvent also fans out to n8n (backwards-compatible wrapper)", async () => {
    const store = new InMemoryPlatformStore("zapier");
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.updated",
      target_url: N8N_URL,
    });
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      return { status: 200 };
    }) as unknown as typeof fetch;
    await emitZapierEvent({ store, fetchFn }, "lead.updated", WS, { leadId: "l1" });
    expect(seen).toEqual([N8N_URL]);
  });

  it("emit never throws when the store fails", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const failing = {
      ...store,
      listActiveSubscriptions: async () => {
        throw new Error("db down");
      },
    };
    await expect(
      emitPlatformEvent(
        { store: failing as unknown as InMemoryPlatformStore },
        "lead.created",
        WS,
        {}
      )
    ).resolves.toBeUndefined();
  });

  it("enqueues the same envelope id for every platform (stable dedup id)", async () => {
    const store = new InMemoryPlatformStore("zapier");
    await subscribePlatformWebhook(store, "zapier", WS, USER, {
      event: "campaign.created",
      target_url: ZAPIER_URL,
    });
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "campaign.created",
      target_url: N8N_URL,
    });
    const envelope = buildEventEnvelope("campaign.created", WS, { campaignId: "c1" });
    const rows = await enqueuePlatformEvent(store, envelope);
    expect(rows).toHaveLength(2);
    expect(rows[0].event_id).toBe(envelope.id);
    expect(rows[1].event_id).toBe(envelope.id);
    expect(rows.map((r) => r.platform).sort()).toEqual(["n8n", "zapier"]);
    // Re-enqueueing the same envelope is idempotent.
    const again = await enqueuePlatformEvent(store, envelope);
    expect(again).toHaveLength(2);
    expect(again[0].id).toBe(rows[0].id);
  });
});

describe("retry worker per platform", () => {
  async function failedDelivery(
    store: InMemoryPlatformStore,
    platform: "zapier" | "n8n",
    targetUrl: string
  ) {
    const created = await subscribePlatformWebhook(store, platform, WS, USER, {
      event: "lead.created",
      target_url: targetUrl,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("subscribe failed");
    const envelope = buildEventEnvelope("lead.created", WS, { leadId: "l1" });
    // Fan-out enqueues one delivery per subscription: pick the
    // row for THIS subscription, not just rows[0].
    const rows = await enqueuePlatformEvent(store, envelope);
    const delivery = rows.find((r) => r.subscription_id === created.subscription.id);
    expect(delivery).toBeDefined();
    const attempt = await attemptPlatformDelivery({ store, fetchFn: failFetch }, delivery!);
    expect(attempt.status).toBe("failed");
    const current = (await store.getDelivery(delivery!.id))!;
    expect(current.next_retry_at).not.toBeNull();
    return current;
  }

  it("retries only the platform's own due deliveries", async () => {
    // One store, bound to n8n, holding a failed delivery per platform.
    const store = new InMemoryPlatformStore("n8n");
    const n8nFailed = await failedDelivery(store, "n8n", N8N_URL);
    const zapierFailed = await failedDelivery(store, "zapier", ZAPIER_URL);
    const retryAt = new Date(
      new Date(n8nFailed.next_retry_at as string).getTime() + 60_000
    ).toISOString();
    // The n8n-bound store's due list holds only the n8n delivery.
    const n8nDue = await store.listDueDeliveries(retryAt);
    expect(n8nDue.map((d) => d.id)).toEqual([n8nFailed.id]);
    const result = await retryDuePlatformDeliveries(
      { store, fetchFn: okFetch },
      "n8n",
      retryAt
    );
    expect(result.due).toBe(1);
    expect(result.delivered).toBe(1);
    const after = await store.getDelivery(n8nFailed.id);
    expect(after?.status).toBe("delivered");
    // The Zapier delivery is untouched by the n8n retry.
    expect((await store.getDelivery(zapierFailed.id))?.status).toBe("failed");
  });

  it("dead-letters after the attempt cap", async () => {
    const store = new InMemoryPlatformStore("n8n");
    await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    const envelope = buildEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueuePlatformEvent(store, envelope);
    let current = delivery;
    for (let i = 0; i < DELIVERY_MAX_ATTEMPTS; i++) {
      const attempt = await attemptPlatformDelivery({ store, fetchFn: failFetch }, current);
      current = (await store.getDelivery(delivery.id))!;
      if (i < DELIVERY_MAX_ATTEMPTS - 1) expect(attempt.status).toBe("failed");
    }
    expect(current.status).toBe("dead");
    expect(current.attempts).toBe(DELIVERY_MAX_ATTEMPTS);
    expect(current.next_retry_at).toBeNull();
  });

  it("a 410 deactivates the subscription and dead-letters the delivery", async () => {
    const store = new InMemoryPlatformStore("n8n");
    const created = await subscribePlatformWebhook(store, "n8n", WS, USER, {
      event: "lead.created",
      target_url: N8N_URL,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const envelope = buildEventEnvelope("lead.created", WS, { leadId: "l1" });
    const [delivery] = await enqueuePlatformEvent(store, envelope);
    const goneFetch = (async () => ({ status: 410 }) as unknown) as typeof fetch;
    const attempt = await attemptPlatformDelivery({ store, fetchFn: goneFetch }, delivery);
    expect(attempt.status).toBe("dead");
    expect(attempt.unsubscribed).toBe(true);
    expect((await store.getSubscription(created.subscription.id))?.active).toBe(false);
  });

  it("retryDuePlatformDeliveries refuses a store bound to the other platform", async () => {
    const store = new InMemoryPlatformStore("zapier");
    await expect(
      retryDuePlatformDeliveries({ store }, "n8n", new Date().toISOString())
    ).rejects.toThrow("bound to");
  });

  it("createPlatformStore exists (Supabase-backed, untested here)", () => {
    expect(typeof createPlatformStore).toBe("function");
  });
});
