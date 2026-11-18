/**
 * NeverBounce adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like NeverBounce's documented
 * API v4 responses; they are not real NeverBounce data. The
 * classification assertions check VERBATIM preservation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createNeverBounceAdapter } from "../adapter";

// MOCK — shaped like NeverBounce's documented /v4/single/check response.
const MOCK_CATCHALL = {
  status: "success",
  result: "catchall",
  flags: ["catchall"],
  suggested_correction: "",
  execution_time: 285,
};

const MOCK_VALID = {
  status: "success",
  result: "valid",
  flags: [],
  suggested_correction: "",
  execution_time: 190,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NeverBounce adapter", () => {
  it("verifies an email and preserves the verbatim catchall classification", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_CATCHALL)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createNeverBounceAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("catchall");
    expect(result.isCatchAll).toBe(true);
    expect(result.creditsUsed).toBe(1);
    expect(calls).toEqual([{ event: "neverbounce.single.check", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain(
      "https://api.neverbounce.com/v4/single/check"
    );
    expect(spy.mock.calls[0][0]).toContain("email=jane%40acme.com");
  });

  it("preserves the valid classification verbatim", async () => {
    mockFetchQueue([jsonResponse(MOCK_VALID)]);
    const adapter = createNeverBounceAdapter({ apiKey: "mock-key" });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("valid");
    expect(result.isCatchAll).toBeNull();
  });

  it("maps an auth failure to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ status: "auth_failure", message: "bad key" }, 401)]);
    const adapter = createNeverBounceAdapter({ apiKey: "bad-key" });
    await expect(adapter.verifyEmail("jane@acme.com")).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createNeverBounceAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk verifies through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_VALID), jsonResponse(MOCK_CATCHALL)]);
    const adapter = createNeverBounceAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.verifyBulk(
      [{ email: "jane@acme.com" }, { email: "boss@acme.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("reads the remaining credits from /account/info", async () => {
    mockFetchQueue([
      jsonResponse({
        credits_info: { paid_credits_remaining: 100, free_credits_remaining: 50 },
      }),
    ]);
    const adapter = createNeverBounceAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(150);
  });
});
