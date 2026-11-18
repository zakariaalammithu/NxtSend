/**
 * SmartReach adapter tests — mocked fetch only, no real network.
 *
 * Covers: lead → campaign mapping, connection test (valid / invalid /
 * retry), suppression respected (a suppressed lead is never sent),
 * dedupe, sync-job lifecycle, error paths, and config-ready operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMemorySyncJobStore, listSyncJobs } from "../../../sync";
import type { Lead } from "@/types";
import {
  createSmartReachAdapter,
  mapLeadToProviderContact,
  sendLeadsToEmailCampaign,
} from "../adapter";

const CREDENTIAL = { apiKey: "test-key" };

const ROUTES: {
  key: string;
  method: string;
  match: string;
  status: number;
  body: unknown;
}[] = [
  { key: "campaigns", method: "GET", match: "/campaigns", status: 200, body: {"data": {"campaigns": [{"id": "1", "name": "Outbound Q1", "status": "active"}]}} },
  { key: "add", method: "POST", match: "/prospects", status: 200, body: {"data": {"prospect": {"id": "p1"}}} }
];

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    workspace_id: "ws-1",
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
    company: "Analytical Engines Ltd",
    job_title: "CEO",
    status: "new",
    tags: [],
    custom_fields: {},
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type RouteOverride =
  | { status: number; body: unknown }
  | { sequence: { status: number; body: unknown }[] };

function installFetch(overrides: Record<string, RouteOverride> = {}) {
  const counters = new Map<string, number>();
  const fetchSpy = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const m = (init?.method ?? "GET").toUpperCase();
    for (const route of ROUTES) {
      if (route.method === m && u.includes(route.match)) {
        const override = overrides[route.key];
        if (override && "sequence" in override) {
          const idx = counters.get(route.key) ?? 0;
          counters.set(route.key, idx + 1);
          const step = override.sequence[Math.min(idx, override.sequence.length - 1)];
          return jsonResponse(step.body, step.status);
        }
        if (override) return jsonResponse(override.body, override.status);
        return jsonResponse(route.body, route.status);
      }
    }
    return jsonResponse({ error: "not mocked" }, 404);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function bodiesOf(fetchSpy: ReturnType<typeof vi.fn>): string {
  return fetchSpy.mock.calls
    .map((c) => {
      const init = c[1] as RequestInit | undefined;
      return typeof init?.body === "string" ? init.body : "";
    })
    .join("\n");
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mapping", () => {
  it("maps a lead to a provider contact", () => {
    const contact = mapLeadToProviderContact(lead());
    expect(contact.email).toBe("ada@example.com");
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBe("Lovelace");
    expect(contact.company).toBe("Analytical Engines Ltd");
    expect(contact.linkedinUrl).toBe("https://www.linkedin.com/in/ada-lovelace");
  });
});

describe("testConnection", () => {
  it("verifies valid credentials", async () => {
    const fetchSpy = installFetch();
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect((calls[0][1].headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
  });

  it("reports invalid credentials without throwing", async () => {
    installFetch({ "campaigns": { status: 401, body: { error: "unauthorized" } } });
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });

  it("retries a 429 then succeeds", async () => {
    const fetchSpy = installFetch({
      "campaigns": {
        sequence: [
          { status: 429, body: { error: "rate limited" } },
          { status: 200, body: {"data": {"campaigns": [{"id": "1", "name": "Outbound Q1", "status": "active"}]}} },
        ],
      },
    });
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    const hits = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/campaigns")
    ).length;
    expect(hits).toBe(2);
  });
});

describe("sendLeadsToEmailCampaign", () => {
  const isSuppressed = async (email: string) => email === "suppressed@example.com";

  it("creates prospects, then reports the unverified assign step as config-ready", async () => {
    const fetchSpy = installFetch();
    const syncStore = createMemorySyncJobStore();
    const leads = [
      lead(),
      lead({ id: "lead-2", email: "suppressed@example.com" }),
      lead({ id: "lead-3", email: "ADA@example.com" }),
    ];
    const result = await sendLeadsToEmailCampaign(
      { credential: CREDENTIAL, isSuppressed, syncStore, workspaceId: "ws-1" },
      { campaignId: "1", leads }
    );
    // Prospects were created, but the assignment step is config-ready:
    // the result carries the note in errors and the job is failed.
    expect(result.created).toBe(1);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.join(" ")).toContain("config-ready");
    const bodies = bodiesOf(fetchSpy);
    expect(bodies).toContain("ada@example.com");
    expect(bodies).not.toContain("suppressed@example.com");
    const jobs = await listSyncJobs(syncStore, "ws-1", "smartreach");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
  });

  it("refuses to send without a suppression checker (fail closed)", async () => {
    installFetch();
    await expect(
      sendLeadsToEmailCampaign(
        { credential: CREDENTIAL },
        { campaignId: "1", leads: [lead()] }
      )
    ).rejects.toThrow(/fail closed/);
  });
});

describe("syncCampaignStatus", () => {
  it("reads the status from the campaign list", async () => {
    installFetch();
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    const status = await adapter.syncCampaignStatus("1");
    expect(status.id).toBe("1");
    expect(status.name).toBe("Outbound Q1");
  });

  it("throws for an unknown campaign id", async () => {
    installFetch();
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    await expect(adapter.syncCampaignStatus("nope")).rejects.toThrow(/not found/);
  });
});

describe("syncReplies", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    await expect(adapter.syncReplies({ campaignId: "1" })).rejects.toThrow(
      /config-ready/
    );
  });
});

describe("syncBouncesAndUnsubscribes", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createSmartReachAdapter({ credential: CREDENTIAL });
    await expect(
      adapter.syncBouncesAndUnsubscribes({ campaignId: "1" })
    ).rejects.toThrow(/config-ready/);
  });
});
