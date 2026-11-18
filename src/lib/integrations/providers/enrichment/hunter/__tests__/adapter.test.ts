/**
 * Hunter.io enrichment adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Hunter's documented
 * API v2 responses; they are not real Hunter data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createHunterAdapter } from "../adapter";

// MOCK — shaped like Hunter's documented combined/find response.
const MOCK_COMBINED = {
  data: {
    first_name: "Matt",
    last_name: "Smith",
    position: "CTO",
    linkedin: "https://www.linkedin.com/in/mattsmith",
    location: "San Francisco, CA",
    company: { name: "Stripe", domain: "stripe.com", industry: "Fintech", size: "1000+" },
  },
};

// MOCK — shaped like Hunter's documented email-finder response.
const MOCK_FINDER = {
  data: {
    email: "kate.conger@vice.com",
    confidence: 92,
    first_name: "Kate",
    last_name: "Conger",
    position: "Reporter",
    company: "Vice",
    verification: { status: "valid" },
    sources: [{ uri: "https://www.vice.com/author/kate-conger" }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Hunter enrichment adapter", () => {
  it("enriches a person by email via combined/find", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_COMBINED)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createHunterAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.enrichLead({ email: "matt@stripe.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.first_name?.value).toBe("Matt");
    expect(result.fields.job_title?.value).toBe("CTO");
    expect(result.fields.company?.value).toBe("Stripe");
    expect(result.fields.linkedin_url?.value).toBe("https://www.linkedin.com/in/mattsmith");
    expect(result.creditsUsed).toBe(1);
    expect(calls).toEqual([{ event: "hunter.combined.find", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain("https://api.hunter.io/v2/combined/find");
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("mock-key");
    // The key must NOT be in the URL.
    expect(spy.mock.calls[0][0] as string).not.toContain("mock-key");
  });

  it("finds an email and preserves Hunter's confidence score", async () => {
    mockFetchQueue([jsonResponse(MOCK_FINDER)]);
    const adapter = createHunterAdapter({ apiKey: "mock-key" });
    const result = await adapter.findEmail({
      firstName: "Kate",
      lastName: "Conger",
      domain: "vice.com",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("kate.conger@vice.com");
    expect(result.fields.email?.confidence).toBeCloseTo(0.92);
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.fields.email_sources?.value).toEqual([
      "https://www.vice.com/author/kate-conger",
    ]);
  });

  it("returns unmatched when the finder has no email", async () => {
    mockFetchQueue([jsonResponse({ data: { email: null, confidence: 0 } })]);
    const adapter = createHunterAdapter({ apiKey: "mock-key" });
    const result = await adapter.findEmail({
      firstName: "No",
      lastName: "Body",
      domain: "example.com",
    });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ errors: [{ details: "Invalid API key" }] }, 401)]);
    const adapter = createHunterAdapter({ apiKey: "bad-key" });
    await expect(adapter.enrichLead({ email: "matt@stripe.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createHunterAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_COMBINED), jsonResponse({ data: null })]);
    const adapter = createHunterAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [{ email: "matt@stripe.com" }, { email: "nobody@stripe.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("reads the remaining searches from /account", async () => {
    mockFetchQueue([
      jsonResponse({ data: { requests: { searches: { available: 42 } } } }),
    ]);
    const adapter = createHunterAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(42);
  });
});
