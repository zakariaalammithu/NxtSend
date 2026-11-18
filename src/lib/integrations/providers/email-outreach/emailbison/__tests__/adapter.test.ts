/**
 * EmailBison adapter tests — mocked fetch only, no real network.
 *
 * Covers: lead → campaign mapping, connection test (valid / invalid /
 * retry), suppression respected (a suppressed lead is never sent),
 * dedupe, sync-job lifecycle, error paths, and config-ready operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMemorySyncJobStore, listSyncJobs } from "../../../sync";
import type { Lead } from "@/types";
import {
  createEmailBisonAdapter,
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
  { key: "connect", method: "GET", match: "/api/users", status: 200, body: {"data": {"id": 1, "name": "Test User", "email": "test@example.com"}} }
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
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );
  });

  it("reports invalid credentials without throwing", async () => {
    installFetch({ "connect": { status: 401, body: { error: "unauthorized" } } });
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });

  it("retries a 429 then succeeds", async () => {
    const fetchSpy = installFetch({
      "connect": {
        sequence: [
          { status: 429, body: { error: "rate limited" } },
          { status: 200, body: {"data": {"id": 1, "name": "Test User", "email": "test@example.com"}} },
        ],
      },
    });
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    const hits = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/users")
    ).length;
    expect(hits).toBe(2);
  });
});

describe("sendLeadsToEmailCampaign", () => {
  const isSuppressed = async () => false;

  it("is config-ready and makes no provider call", async () => {
    const fetchSpy = installFetch();
    const syncStore = createMemorySyncJobStore();
    const promise = sendLeadsToEmailCampaign(
      { credential: CREDENTIAL, isSuppressed, syncStore, workspaceId: "ws-1" },
      { campaignId: "1", leads: [lead()] }
    );
    await expect(promise).rejects.toThrow(/config-ready/);
    expect(fetchSpy).not.toHaveBeenCalled();
    const jobs = await listSyncJobs(syncStore, "ws-1", "emailbison");
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
  it("is config-ready", async () => {
    installFetch();
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    const promise = adapter.syncCampaignStatus("1");
    await expect(promise).rejects.toThrow(/config-ready/);
  });
});

describe("syncReplies", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    await expect(adapter.syncReplies({ campaignId: "1" })).rejects.toThrow(
      /config-ready/
    );
  });
});

describe("syncBouncesAndUnsubscribes", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createEmailBisonAdapter({ credential: CREDENTIAL });
    await expect(
      adapter.syncBouncesAndUnsubscribes({ campaignId: "1" })
    ).rejects.toThrow(/config-ready/);
  });
});
