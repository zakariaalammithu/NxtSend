/**
 * ZoomInfo adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like ZoomInfo's documented
 * legacy /enrich/contact response; they are not real ZoomInfo data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createZoomInfoAdapter } from "../adapter";

// MOCK — shaped like ZoomInfo's documented enrich/contact response.
const MOCK_PERSON = {
  data: [
    {
      firstName: "Jane",
      lastName: "Doe",
      jobTitle: "VP Sales",
      email: "jane@acme.com",
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
      managementLevel: "VP",
      department: "Sales",
      company: { name: "Acme", website: "acme.com", industry: "Software" },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ZoomInfo adapter", () => {
  it("enriches a person by email via /enrich/contact with a Bearer token", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_PERSON)]);
    const adapter = createZoomInfoAdapter({ accessToken: "mock-token" });
    const result = await adapter.enrichLead({ email: "jane@acme.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
    expect(result.fields.job_title?.value).toBe("VP Sales");
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.creditsUsed).toBe(1);
    expect(spy.mock.calls[0][0]).toBe("https://api.zoominfo.com/enrich/contact");
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mock-token");
  });

  it("supports a getAccessToken callback for short-lived tokens", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_PERSON)]);
    const adapter = createZoomInfoAdapter({
      getAccessToken: async () => "fresh-mock-token",
    });
    await adapter.enrichLead({ email: "jane@acme.com" });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fresh-mock-token");
  });

  it("returns unmatched with zero credits when no record is found", async () => {
    mockFetchQueue([jsonResponse({ data: [] })]);
    const adapter = createZoomInfoAdapter({ accessToken: "mock-token" });
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "invalid_token" }, 401)]);
    const adapter = createZoomInfoAdapter({ accessToken: "bad-token" });
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without a token or callback", () => {
    expect(() => createZoomInfoAdapter({})).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_PERSON), jsonResponse({ data: [] })]);
    const adapter = createZoomInfoAdapter({ accessToken: "mock-token" });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [{ email: "jane@acme.com" }, { email: "nobody@acme.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
