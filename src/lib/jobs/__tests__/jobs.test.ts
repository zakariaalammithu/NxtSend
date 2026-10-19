import { describe, it, expect, vi, afterEach } from "vitest";
import { runDueJobs } from "../runner";
import { createJobHandlers, monthPeriodStart } from "../handlers";
import { InMemoryJobStore } from "../store";
import type { JobsContext } from "../types";

// ── Fake context: two workspaces; ws_1 is over the free leads limit ────────

function fakeContext(): JobsContext & {
  usage: Array<{ workspaceId: string; metric: string; period: string; quantity: number }>;
} {
  const usage: Array<{ workspaceId: string; metric: string; period: string; quantity: number }> = [];
  return {
    usage,
    async listWorkspaces() {
      return ["ws_1", "ws_2"];
    },
    async getWorkspacePlan() {
      return "free";
    },
    async countWorkspaceMetric(workspaceId, metric) {
      if (workspaceId === "ws_1" && metric === "leads") return 600; // free limit: 500
      return 3;
    },
    async upsertUsageRecord(workspaceId, metric, period, quantity) {
      usage.push({ workspaceId, metric, period, quantity });
    },
    async listDueWebhookRetries() {
      return [];
    },
    async retryWebhookDelivery() {
      return { status: "no_config" };
    },
  };
}

describe("runDueJobs — usage_rollup (real handler)", () => {
  it("rolls up all metrics per workspace and flags over-limit usage", async () => {
    const store = new InMemoryJobStore();
    store.seed({ type: "usage_rollup", idempotency_key: "rollup:2026-10" });
    const ctx = fakeContext();
    const summary = await runDueJobs({
      store,
      ctx,
      handlers: createJobHandlers(),
    });
    expect(summary.processed).toBe(1);
    expect(summary.completed).toBe(1);
    // 2 workspaces x 3 metrics
    expect(ctx.usage).toHaveLength(6);
    expect(ctx.usage).toContainEqual({
      workspaceId: "ws_1",
      metric: "leads",
      period: monthPeriodStart(new Date()),
      quantity: 600,
    });
    expect(summary.results[0].message).toContain("Over plan limit");
    expect(summary.results[0].message).toContain("ws_1:leads=600/500");
    // A run log row was written.
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].status).toBe("completed");
  });

  it("is idempotent: a duplicate key is skipped, and a re-run processes nothing", async () => {
    const store = new InMemoryJobStore();
    store.seed({ type: "usage_rollup", idempotency_key: "rollup:2026-10" });
    store.seed({ type: "usage_rollup", idempotency_key: "rollup:2026-10" });
    const ctx = fakeContext();

    const first = await runDueJobs({ store, ctx, handlers: createJobHandlers() });
    expect(first.completed).toBe(1);
    expect(first.skipped).toBe(1);
    // The handler ran exactly once: 6 usage rows, not 12.
    expect(ctx.usage).toHaveLength(6);

    const second = await runDueJobs({ store, ctx, handlers: createJobHandlers() });
    expect(second.processed).toBe(0);
    expect(ctx.usage).toHaveLength(6);
  });
});

describe("runDueJobs — follow_up_due (real executor since Stage F)", () => {
  it("without a wired executor is recorded as skipped with an honest explanation", async () => {
    const store = new InMemoryJobStore();
    const job = store.seed({ type: "follow_up_due", idempotency_key: "fu:1" });
    const summary = await runDueJobs({
      store,
      ctx: fakeContext(),
      handlers: createJobHandlers(),
    });
    // The fake context provides no executor: the handler records an
    // explicit skipped outcome instead of pretending to scan, and
    // nothing is sent.
    expect(summary.skipped).toBe(1);
    expect(summary.results[0].message).toContain(
      "not available in this worker context"
    );
    expect(summary.results[0].message).toContain("Nothing was sent");
    expect(summary.results[0].message).not.toContain("Not implemented");
    expect(store.jobs.get(job.id)?.status).toBe("skipped");
  });

  it("with a wired executor runs the real scan and completes", async () => {
    const store = new InMemoryJobStore();
    const job = store.seed({ type: "follow_up_due", idempotency_key: "fu:2" });
    const ctx: JobsContext = {
      ...fakeContext(),
      getSequenceExecutor() {
        return {
          store: {
            simulated: true,
            async listEnrollments() {
              return [];
            },
            async getCampaign() {
              return null;
            },
            async getSteps() {
              return [];
            },
            async getLead() {
              return null;
            },
            async getLeadSignals() {
              return { repliedAt: null, suppressionReason: null };
            },
            async getWorkspacePlan() {
              return "free" as const;
            },
            async countEmailsThisMonth() {
              return 0;
            },
            async claimStepExecution() {
              return null;
            },
            async completeStepExecution() {},
            async releaseStepExecution() {},
            async ensureConversation() {
              return "conv_1";
            },
            async insertMessage() {
              return { id: "m" } as never;
            },
            async updateEnrollment() {},
            async appendActivity() {},
          },
          adapter: {
            provider: "fake",
            getState() {
              return "demo" as const;
            },
            async sendEmail() {
              return {
                status: "simulated" as const,
                provider: "fake",
                providerMessageId: null,
                message: "simulated",
              };
            },
          },
        };
      },
    };
    const summary = await runDueJobs({
      store,
      ctx,
      handlers: createJobHandlers(),
    });
    expect(summary.completed).toBe(1);
    expect(summary.results[0].message).toContain("Sequence scan");
    expect(summary.results[0].message).toContain("Scanned 0 enrollment(s)");
    expect(store.jobs.get(job.id)?.status).toBe("completed");
  });

  it("skips unknown job types with an explanatory log", async () => {
    const store = new InMemoryJobStore();
    store.seed({ type: "mystery_type", idempotency_key: "m:1" });
    const summary = await runDueJobs({
      store,
      ctx: fakeContext(),
      handlers: createJobHandlers(),
    });
    expect(summary.skipped).toBe(1);
    expect(summary.results[0].message).toContain("Unknown job type");
  });

  it("a throwing handler marks the job failed with attempts incremented", async () => {
    const store = new InMemoryJobStore();
    const job = store.seed({ type: "usage_rollup", idempotency_key: "boom:1" });
    const ctx = fakeContext();
    ctx.listWorkspaces = async () => {
      throw new Error("db unreachable");
    };
    const summary = await runDueJobs({
      store,
      ctx,
      handlers: createJobHandlers(),
    });
    expect(summary.failed).toBe(1);
    const record = store.jobs.get(job.id);
    expect(record?.status).toBe("failed");
    expect(record?.attempts).toBe(1);
    expect(record?.last_error).toContain("db unreachable");
    expect(store.runs[0].status).toBe("failed");
  });
});

// ── Route secret guard ──────────────────────────────────────────────────────

describe("/api/jobs/run secret guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  function request(headers: Record<string, string>) {
    return new Request("http://localhost:3000/api/jobs/run", {
      method: "POST",
      headers,
    });
  }

  it("refuses with 503 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { POST } = await import("@/app/api/jobs/run/route");
    const res = await POST(request({}));
    expect(res.status).toBe(503);
  });

  it("rejects a wrong secret with 401", async () => {
    vi.stubEnv("CRON_SECRET", "the-real-cron-secret-value");
    const { POST } = await import("@/app/api/jobs/run/route");
    const res = await POST(request({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("runs (demo summary) with the correct Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "the-real-cron-secret-value");
    const { POST } = await import("@/app/api/jobs/run/route");
    const res = await POST(
      request({ authorization: "Bearer the-real-cron-secret-value" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; processed: number };
    expect(body.mode).toBe("demo");
    expect(body.processed).toBe(0);
  });
});
