/**
 * Apollo.io adapter tests — mocked fetch only, no real network.
 * All provider payloads below are MOCK responses shaped like
 * Apollo's documented /people/match response; they are not real
 * Apollo data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import {
  createUsageSpy,
  jsonResponse,
  mockFetchQueue,
} from "../../../test-utils";
import { createApolloAdapter } from "../adapter";

// MOCK — shaped like Apollo's documented people/match response.
const MOCK_PERSON = {
  person: {
    first_name: "Jane",
    last_name: "Doe",
    title: "Director of Product",
    email: "jane.doe@acme.com",
    linkedin_url: "https://www.linkedin.com/in/jane-doe",
    email_status: "verified",
    organization: {
      name: "Acme",
      primary_domain: "acme.com",
      industry: "Software",
      estimated_num_employees: 250,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Apollo adapter", () => {
  it("enriches a person by email and preserves fields with source", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_PERSON)]);
    const { recorder } = createUsageSpy();
    const adapter = createApolloAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.enrichLead({ email: "jane.doe@acme.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane.doe@acme.com");
    expect(result.fields.email?.source).toBe("apollo");
    expect(result.fields.job_title?.value).toBe("Director of Product");
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.fields.company_domain?.value).toBe("acme.com");
    expect(result.creditsUsed).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("https://api.apollo.io/api/v1/people/match");
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("mock-key");
  });

  it("returns unmatched with zero credits when no person is found", async () => {
    mockFetchQueue([jsonResponse({ person: null })]);
    const adapter = createApolloAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
    expect(Object.keys(result.fields)).toHaveLength(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "unauthorized" }, 401)]);
    const adapter = createApolloAdapter({ apiKey: "bad-key" });
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createApolloAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk enriches through a sync job and dedupes by email", async () => {
    mockFetchQueue([
      jsonResponse(MOCK_PERSON),
      jsonResponse({ person: null }),
    ]);
    const adapter = createApolloAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [
        { email: "jane.doe@acme.com" },
        { email: "Jane.Doe@acme.com" },
        { email: "nobody@acme.com" },
      ],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(2); // 1 duplicate + 1 unmatched
    expect(result.failed).toBe(0);
    const jobs = await store.listByWorkspace("ws-1", "apollo");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("completed");
  });

  it("enriches a company by domain", async () => {
    mockFetchQueue([
      jsonResponse({
        organization: {
          name: "Acme",
          primary_domain: "acme.com",
          industry: "Software",
          estimated_num_employees: 250,
        },
      }),
    ]);
    const adapter = createApolloAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichCompany({ domain: "acme.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.creditsUsed).toBe(1);
  });
});
