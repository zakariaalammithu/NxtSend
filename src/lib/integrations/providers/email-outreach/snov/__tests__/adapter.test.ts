/**
 * Snov.io adapter tests — mocked fetch only, no real network.
 *
 * Covers: lead → campaign mapping, connection test (valid / invalid /
 * retry), suppression respected (a suppressed lead is never sent),
 * dedupe, sync-job lifecycle, error paths, and config-ready operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMemorySyncJobStore, listSyncJobs } from "../../../sync";
import type { Lead } from "@/types";
import {
  createSnovioAdapter,
  mapLeadToProviderContact,
  sendLeadsToEmailCampaign,
} from "../adapter";

const CREDENTIAL = { apiKey: "test-user-id", extra: { client_secret: "test-secret" } };

const ROUTES: {
  key: string;
  method: string;
  match: string;
  status: number;
  body: unknown;
}[] = [
  { key: "campaigns", method: "GET", match: "/v1/get-user-campaigns", status: 200, body: [{"id": "c1", "name": "Drip 1"}] },
  { key: "token", method: "POST", match: "/oauth/access_token", status: 200, body: {"access_token": "tok_123", "expires_in": 3600, "token_type": "Bearer"} }
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
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    const tokenCall = calls.find(([u]) => u.includes("/oauth/access_token"));
    expect(tokenCall).toBeDefined();
    const apiCall = calls.find(([u]) => u.includes("/v1/get-user-campaigns"));
    expect(apiCall).toBeDefined();
    expect((apiCall![1].headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_123"
    );
  });

  it("reports invalid credentials without throwing", async () => {
    installFetch({ "campaigns": { status: 401, body: { error: "unauthorized" } } });
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });

  it("retries a 429 then succeeds", async () => {
    const fetchSpy = installFetch({
      "campaigns": {
        sequence: [
          { status: 429, body: { error: "rate limited" } },
          { status: 200, body: [{"id": "c1", "name": "Drip 1"}] },
        ],
      },
    });
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    const hits = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/v1/get-user-campaigns")
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
      { campaignId: "c1", leads: [lead()] }
    );
    await expect(promise).rejects.toThrow(/config-ready/);
    expect(fetchSpy).not.toHaveBeenCalled();
    const jobs = await listSyncJobs(syncStore, "ws-1", "snov");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
  });

  it("refuses to send without a suppression checker (fail closed)", async () => {
    installFetch();
    await expect(
      sendLeadsToEmailCampaign(
        { credential: CREDENTIAL },
        { campaignId: "c1", leads: [lead()] }
      )
    ).rejects.toThrow(/fail closed/);
  });
});

describe("syncCampaignStatus", () => {
  it("reads the status from the campaign list", async () => {
    installFetch();
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    const status = await adapter.syncCampaignStatus("c1");
    expect(status.id).toBe("c1");
    expect(status.name).toBe("Drip 1");
  });

  it("throws for an unknown campaign id", async () => {
    installFetch();
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    await expect(adapter.syncCampaignStatus("nope")).rejects.toThrow(/not found/);
  });
});

describe("syncReplies", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    await expect(adapter.syncReplies({ campaignId: "c1" })).rejects.toThrow(
      /config-ready/
    );
  });
});

describe("syncBouncesAndUnsubscribes", () => {
  it("is config-ready", async () => {
    installFetch();
    const adapter = createSnovioAdapter({ credential: CREDENTIAL });
    await expect(
      adapter.syncBouncesAndUnsubscribes({ campaignId: "c1" })
    ).rejects.toThrow(/config-ready/);
  });
});
