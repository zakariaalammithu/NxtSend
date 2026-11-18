/**
 * Snov.io adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Snov.io's documented
 * API responses; they are not real Snov.io data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import {
  createUsageSpy,
  instantSleep,
  jsonResponse,
  mockFetchQueue,
} from "../../../test-utils";
import { createSnovAdapter } from "../adapter";

// MOCK — shaped like Snov.io's documented oauth token response.
const MOCK_TOKEN = { access_token: "mock-snov-token", token_type: "Bearer", expires_in: 3600 };

// MOCK — shaped like Snov.io's documented emails-by-domain-by-name result.
const MOCK_FINDER_RESULT = {
  success: true,
  data: [
    {
      email: "kate.conger@vice.com",
      first_name: "Kate",
      last_name: "Conger",
      position: "Reporter",
      company_name: "Vice",
      verification_status: "valid",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeAdapter() {
  const usage = createUsageSpy();
  const adapter = createSnovAdapter({
    clientId: "mock-client-id",
    clientSecret: "mock-client-secret",
    recordUsage: usage.recorder,
    sleep: instantSleep,
    pollIntervalMs: 0,
  });
  return { adapter, usage };
}

describe("Snov.io adapter", () => {
  it("exchanges client credentials for a token, then finds an email (async task flow)", async () => {
    const spy = mockFetchQueue([
      jsonResponse(MOCK_TOKEN),
      jsonResponse({ task_hash: "mock-task" }),
      jsonResponse(MOCK_FINDER_RESULT),
    ]);
    const { adapter, usage } = makeAdapter();
    const result = await adapter.findEmail({
      firstName: "Kate",
      lastName: "Conger",
      domain: "vice.com",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("kate.conger@vice.com");
    expect(result.fields.job_title?.value).toBe("Reporter");
    expect(result.fields.email_verification_status?.value).toBe("valid");
    expect(result.creditsUsed).toBe(1);
    expect(usage.calls).toContainEqual({
      event: "snov.emails-by-domain-by-name",
      creditsUsed: 1,
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0][0]).toBe("https://api.snov.io/v1/oauth/access_token");
    expect(spy.mock.calls[1][0]).toBe(
      "https://api.snov.io/v2/emails-by-domain-by-name/start"
    );
    expect(spy.mock.calls[2][0]).toBe(
      "https://api.snov.io/v2/emails-by-domain-by-name/result?task_hash=mock-task"
    );
    const tokenHeaders = (spy.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(tokenHeaders.Authorization).toBe("Bearer mock-snov-token");
  });

  it("reuses the cached token on the second call", async () => {
    const spy = mockFetchQueue([
      jsonResponse(MOCK_TOKEN),
      jsonResponse({ task_hash: "task-1" }),
      jsonResponse(MOCK_FINDER_RESULT),
      jsonResponse({ task_hash: "task-2" }),
      jsonResponse(MOCK_FINDER_RESULT),
    ]);
    const { adapter } = makeAdapter();
    await adapter.findEmail({ firstName: "Kate", lastName: "Conger", domain: "vice.com" });
    await adapter.findEmail({ firstName: "Kate", lastName: "Conger", domain: "vice.com" });
    // Token fetched once; each find is start + result.
    expect(spy).toHaveBeenCalledTimes(5);
    expect(spy.mock.calls[0][0]).toBe("https://api.snov.io/v1/oauth/access_token");
  });

  it("returns unmatched when the finder returns no prospect", async () => {
    mockFetchQueue([
      jsonResponse(MOCK_TOKEN),
      jsonResponse({ task_hash: "mock-task" }),
      jsonResponse({ success: true, data: [] }),
    ]);
    const { adapter } = makeAdapter();
    const result = await adapter.findEmail({
      firstName: "No",
      lastName: "Body",
      domain: "example.com",
    });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a 401 from the token endpoint to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "invalid_client" }, 401)]);
    const { adapter } = makeAdapter();
    await expect(
      adapter.findEmail({ firstName: "Kate", lastName: "Conger", domain: "vice.com" })
    ).rejects.toMatchObject({ code: "provider_auth_failed" });
  });

  it("throws provider_credentials_missing without client id/secret", () => {
    expect(() =>
      createSnovAdapter({ clientId: "", clientSecret: "x" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
    expect(() =>
      createSnovAdapter({ clientId: "x", clientSecret: "" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([
      jsonResponse(MOCK_TOKEN),
      jsonResponse({ task_hash: "task-1" }),
      jsonResponse(MOCK_FINDER_RESULT),
      jsonResponse({ task_hash: "task-2" }),
      jsonResponse({ success: true, data: [] }),
    ]);
    const { adapter } = makeAdapter();
    const store = createMemorySyncJobStore();
    const result = await adapter.bulkEnrich(
      [
        { firstName: "Kate", lastName: "Conger", domain: "vice.com" },
        { firstName: "No", lastName: "Body", domain: "example.com" },
      ],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
