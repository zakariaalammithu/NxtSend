/**
 * SalesQL adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like SalesQL's documented
 * /persons/enrich response (salesql.com/api); they are not real
 * SalesQL data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createSalesQlAdapter } from "../adapter";

// MOCK — shaped like SalesQL's documented persons/enrich response.
const MOCK_PERSON = {
  full_name: "Jane Doe",
  first_name: "Jane",
  last_name: "Doe",
  title: "Director of Product",
  location: "San Francisco, CA",
  linkedin_url: "linkedin.com/in/jane-doe",
  company: "Acme",
  emails: [{ email: "jane.doe@acme.com", status: "Valid" }],
  phones: [{ phone: "+1 415 555 0199", type: "Mobile", is_valid: true }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SalesQL adapter", () => {
  it("enriches a person by LinkedIn URL with a Bearer token", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_PERSON)]);
    const adapter = createSalesQlAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichLead({
      linkedinUrl: "linkedin.com/in/jane-doe",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane.doe@acme.com");
    expect(result.fields.email_status?.value).toBe("Valid");
    expect(result.fields.phone?.value).toBe("+1 415 555 0199");
    expect(result.fields.phone_is_valid?.value).toBe(true);
    expect(result.fields.job_title?.value).toBe("Director of Product");
    expect(result.creditsUsed).toBe(1);
    expect(spy.mock.calls[0][0]).toContain(
      "https://api-public.salesql.com/v1/persons/enrich"
    );
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mock-key");
  });

  it("returns unmatched with zero credits on a 404 (no result, no charge)", async () => {
    mockFetchQueue([jsonResponse({ error: "not found" }, 404)]);
    const adapter = createSalesQlAdapter({ apiKey: "mock-key" });
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "unauthorized" }, 401)]);
    const adapter = createSalesQlAdapter({ apiKey: "bad-key" });
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createSalesQlAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("refuses company enrichment — endpoint path unverified", async () => {
    const adapter = createSalesQlAdapter({ apiKey: "mock-key" });
    await expect(adapter.enrichCompany({ domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_endpoint_unverified",
    });
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_PERSON)]);
    const adapter = createSalesQlAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [{ linkedinUrl: "linkedin.com/in/jane-doe" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
  });
});
