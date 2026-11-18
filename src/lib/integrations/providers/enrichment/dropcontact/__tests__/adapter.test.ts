/**
 * Dropcontact adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Dropcontact's documented
 * /v1/enrich/all responses (developer.dropcontact.com); they are
 * not real Dropcontact data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import {
  createUsageSpy,
  instantSleep,
  jsonResponse,
  mockFetchQueue,
} from "../../../test-utils";
import { createDropcontactAdapter } from "../adapter";

// MOCK — shaped like Dropcontact's documented enrich submit response.
const MOCK_SUBMIT = { credits_left: 15277, request_id: "mock-request-id", error: false, success: true };

// MOCK — shaped like Dropcontact's documented "not ready yet" response.
const MOCK_NOT_READY = {
  error: false,
  reason: "Request not ready yet, try again in 30 seconds",
  success: false,
};

// MOCK — shaped like Dropcontact's documented enrich result.
const MOCK_RESULT = {
  data: [
    {
      first_name: "Denis",
      last_name: "Cohen",
      full_name: "Denis Cohen",
      civility: "Mr",
      linkedin: "www.linkedin.com/in/cohendenis",
      location: "Paris, Île-de-France, France",
      email: [{ email: "dc@dropcontact.io", qualification: "nominative@pro" }],
      company: "Dropcontact",
      website: "www.dropcontact.com",
      country: "France",
      siren: "823752647",
      industry: "Technology, Information and Internet",
      nb_employees: "10-19",
    },
  ],
  credits_left: 15276,
  error: false,
  success: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dropcontact adapter", () => {
  it("submits a batch, polls until ready, and preserves the email qualification", async () => {
    const spy = mockFetchQueue([
      jsonResponse(MOCK_SUBMIT),
      jsonResponse(MOCK_NOT_READY),
      jsonResponse(MOCK_RESULT),
    ]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createDropcontactAdapter({
      apiKey: "mock-key",
      recordUsage: recorder,
      sleep: instantSleep,
      pollIntervalMs: 0,
    });
    const result = await adapter.enrichLead({
      firstName: "Denis",
      lastName: "Cohen",
      company: "Dropcontact",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("dc@dropcontact.io");
    expect(result.fields.email_qualification?.value).toBe("nominative@pro");
    expect(result.fields.company?.value).toBe("Dropcontact");
    expect(result.fields.siren?.value).toBe("823752647");
    expect(result.creditsUsed).toBe(1);
    expect(result.creditsRemaining).toBe(15276);
    expect(calls).toEqual([{ event: "dropcontact.enrich.all", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toBe("https://api.dropcontact.com/v1/enrich/all");
    expect(spy.mock.calls[1][0]).toBe(
      "https://api.dropcontact.com/v1/enrich/all/mock-request-id"
    );
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Access-Token"]).toBe("mock-key");
  });

  it("returns unmatched when the batch has no email", async () => {
    mockFetchQueue([
      jsonResponse(MOCK_SUBMIT),
      jsonResponse({
        data: [{ first_name: "No", last_name: "Body", email: [] }],
        credits_left: 15277,
        success: true,
      }),
    ]);
    const adapter = createDropcontactAdapter({
      apiKey: "mock-key",
      sleep: instantSleep,
      pollIntervalMs: 0,
    });
    const result = await adapter.enrichLead({ firstName: "No", lastName: "Body", company: "Acme" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "No api key received" }, 401)]);
    const adapter = createDropcontactAdapter({ apiKey: "bad-key", sleep: instantSleep });
    await expect(
      adapter.enrichLead({ firstName: "Denis", lastName: "Cohen", company: "Dropcontact" })
    ).rejects.toMatchObject({ code: "provider_auth_failed" });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createDropcontactAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([
      jsonResponse(MOCK_SUBMIT),
      jsonResponse(MOCK_RESULT),
      jsonResponse({ ...MOCK_SUBMIT, request_id: "req-2" }),
      jsonResponse({
        data: [{ first_name: "No", last_name: "Body", email: [] }],
        credits_left: 15276,
        success: true,
      }),
    ]);
    const adapter = createDropcontactAdapter({
      apiKey: "mock-key",
      sleep: instantSleep,
      pollIntervalMs: 0,
    });
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [
        { firstName: "Denis", lastName: "Cohen", company: "Dropcontact" },
        { firstName: "No", lastName: "Body", company: "Acme" },
      ],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
