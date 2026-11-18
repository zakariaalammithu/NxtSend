/**
 * ContactOut adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like ContactOut's documented
 * API responses; they are not real ContactOut data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createContactOutAdapter } from "../adapter";

// MOCK — shaped like ContactOut's documented people/enrich response.
const MOCK_PROFILE = {
  profile: {
    first_name: "Jane",
    last_name: "Doe",
    title: "Director of Product",
    emails: [{ email: "jane@acme.com", type: "work" }],
    phones: [{ phone: "+14155550199" }],
    linkedin_url: "https://www.linkedin.com/in/jane-doe",
    location: "San Francisco, CA",
    company: { name: "Acme" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ContactOut adapter", () => {
  it("enriches a LinkedIn profile via /v1/linkedin/enrich with the token header", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_PROFILE)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createContactOutAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.enrichLead({
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
    expect(result.fields.phone?.value).toBe("+14155550199");
    expect(result.fields.job_title?.value).toBe("Director of Product");
    // 1 search + 1 email + 1 phone credit, per ContactOut's docs.
    expect(result.creditsUsed).toBe(3);
    expect(calls).toEqual([{ event: "contactout.linkedin.enrich", creditsUsed: 3 }]);
    expect(spy.mock.calls[0][0]).toContain(
      "https://api.contactout.com/v1/linkedin/enrich"
    );
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.token).toBe("mock-key");
  });

  it("enriches by email via POST /v1/people/enrich", async () => {
    mockFetchQueue([jsonResponse(MOCK_PROFILE)]);
    const adapter = createContactOutAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichLead({ email: "jane@acme.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
  });

  it("returns unmatched with zero credits when no profile is found", async () => {
    mockFetchQueue([jsonResponse({ profile: null })]);
    const adapter = createContactOutAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "invalid token" }, 401)]);
    const adapter = createContactOutAdapter({ apiKey: "bad-key" });
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createContactOutAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("rejects company enrichment as unsupported", async () => {
    const adapter = createContactOutAdapter({ apiKey: "mock-key" });
    await expect(adapter.enrichCompany({ domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_operation_unsupported",
    });
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_PROFILE), jsonResponse({ profile: null })]);
    const adapter = createContactOutAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [
        { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
        { email: "nobody@acme.com" },
      ],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
