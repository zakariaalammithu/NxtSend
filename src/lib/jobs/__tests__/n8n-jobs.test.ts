/**
 * n8n webhook-retry job tests.
 *
 * What is being protected: the `n8n_webhook_retry` job type and
 * handler exist and run through the platform-parameterised
 * context methods; the Zapier handler still works through the
 * legacy context methods (fallback) and through the platform
 * methods; a context without any webhook methods records an
 * honest "skipped" for n8n instead of failing; and the daily
 * enqueue keys are per-platform, per-day.
 */

import { describe, it, expect } from "vitest";
import { runDueJobs } from "../runner";
import { createJobHandlers } from "../handlers";
import { InMemoryJobStore } from "../store";
import { JOB_TYPES, type JobsContext, type JobRecord } from "../types";
import { platformWebhookRetryKey } from "../producer";

function baseContext(): JobsContext {
  return {
    async listWorkspaces() {
      return [];
    },
    async getWorkspacePlan() {
      return "free";
    },
    async countWorkspaceMetric() {
      return 0;
    },
    async upsertUsageRecord() {},
    async listDueWebhookRetries() {
      return [];
    },
    async retryWebhookDelivery() {
      return { status: "no_config" };
    },
  };
}

function seedJob(store: InMemoryJobStore, type: string): JobRecord {
  return store.seed({ type, idempotency_key: `${type}:test-1` });
}

describe("n8n_webhook_retry job", () => {
  it("is a known job type with a registered handler", () => {
    expect((JOB_TYPES as readonly string[]).includes("n8n_webhook_retry")).toBe(true);
    expect(createJobHandlers().n8n_webhook_retry).toBeTypeOf("function");
    expect(createJobHandlers().zapier_webhook_retry).toBeTypeOf("function");
  });

  it("retries due n8n deliveries through the platform methods", async () => {
    const store = new InMemoryJobStore();
    seedJob(store, "n8n_webhook_retry");
    const retried: Array<{ platform: string; id: string }> = [];
    const ctx = baseContext();
    ctx.listDuePlatformRetries = async (platform) => {
      expect(platform).toBe("n8n");
      return [
        { id: "d1", workspace_id: "ws", status: "failed", attempts: 1, max_attempts: 3 },
        { id: "d2", workspace_id: "ws", status: "failed", attempts: 2, max_attempts: 3 },
      ];
    };
    ctx.retryPlatformDelivery = async (platform, id) => {
      retried.push({ platform, id });
      return { status: id === "d1" ? "delivered" : "dead" };
    };
    ctx.cleanupStalePlatformSubscriptions = async (platform) => {
      expect(platform).toBe("n8n");
      return 2;
    };
    const summary = await runDueJobs({ store, ctx, handlers: createJobHandlers() });
    expect(summary.completed).toBe(1);
    expect(retried).toEqual([
      { platform: "n8n", id: "d1" },
      { platform: "n8n", id: "d2" },
    ]);
    expect(summary.results[0].message).toContain("n8n webhook retries: 2 due");
    expect(summary.results[0].message).toContain("1 delivered");
    expect(summary.results[0].message).toContain("1 dead");
    expect(summary.results[0].message).toContain("2 stale inactive subscription(s) removed");
  });

  it("skips honestly when the context has no webhook methods", async () => {
    const store = new InMemoryJobStore();
    seedJob(store, "n8n_webhook_retry");
    const summary = await runDueJobs({
      store,
      ctx: baseContext(),
      handlers: createJobHandlers(),
    });
    expect(summary.skipped).toBe(1);
    expect(summary.results[0].message).toContain("n8n outbox is not available");
  });

  it("runs the Zapier handler through the platform methods too", async () => {
    const store = new InMemoryJobStore();
    seedJob(store, "zapier_webhook_retry");
    const ctx = baseContext();
    ctx.listDuePlatformRetries = async (platform) => {
      expect(platform).toBe("zapier");
      return [
        { id: "z1", workspace_id: "ws", status: "failed", attempts: 1, max_attempts: 3 },
      ];
    };
    ctx.retryPlatformDelivery = async () => ({ status: "delivered" });
    const summary = await runDueJobs({ store, ctx, handlers: createJobHandlers() });
    expect(summary.completed).toBe(1);
    expect(summary.results[0].message).toContain("Zapier webhook retries: 1 due");
  });

  it("falls back to the legacy Zapier-only context methods", async () => {
    const store = new InMemoryJobStore();
    seedJob(store, "zapier_webhook_retry");
    const ctx = baseContext();
    ctx.listDueZapierRetries = async () => [
      { id: "z1", workspace_id: "ws", status: "failed", attempts: 1, max_attempts: 3 },
    ];
    ctx.retryZapierDelivery = async () => ({ status: "delivered" });
    const summary = await runDueJobs({ store, ctx, handlers: createJobHandlers() });
    expect(summary.completed).toBe(1);
    expect(summary.results[0].message).toContain("Zapier webhook retries: 1 due");
  });

  it("enqueues per-platform, per-day idempotency keys", () => {
    const day = new Date("2026-11-18T00:00:00Z");
    expect(platformWebhookRetryKey("n8n", day)).toBe("n8n-webhook-retry:2026-11-18");
    expect(platformWebhookRetryKey("zapier", day)).toBe("zapier-webhook-retry:2026-11-18");
    expect(platformWebhookRetryKey("n8n", new Date("2026-11-19T00:00:00Z"))).not.toBe(
      platformWebhookRetryKey("n8n", day)
    );
  });
});
