/**
 * Bouncer adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Bouncer's documented
 * API v1.1 responses; they are not real Bouncer data. The
 * classification assertions check VERBATIM preservation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createBouncerAdapter } from "../adapter";

// MOCK — shaped like Bouncer's documented /v1.1/email/verify response.
const MOCK_RISKY = {
  status: "risky",
  reason: "low_quality",
  domain: { name: "acme.com", disposable: "no", free: "no" },
  account: { role: "no", disposable: "no" },
  score: 0.42,
  credits: 499,
};

const MOCK_DELIVERABLE = {
  status: "deliverable",
  reason: "accepted_email",
  domain: { name: "acme.com", disposable: "no", free: "no" },
  account: { role: "no", disposable: "no" },
  score: 0.98,
  credits: 498,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Bouncer adapter", () => {
  it("verifies an email and preserves the verbatim risky classification + reason", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_RISKY)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createBouncerAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("risky");
    expect(result.substatus).toBe("low_quality");
    expect(result.score).toBeCloseTo(0.42);
    expect(result.creditsRemaining).toBe(499);
    expect(result.creditsUsed).toBe(1);
    expect(calls).toEqual([{ event: "bouncer.email.verify", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain(
      "https://api.usebouncer.com/v1.1/email/verify"
    );
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("mock-key");
  });

  it("preserves the deliverable classification verbatim", async () => {
    mockFetchQueue([jsonResponse(MOCK_DELIVERABLE)]);
    const adapter = createBouncerAdapter({ apiKey: "mock-key" });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("deliverable");
    expect(result.substatus).toBe("accepted_email");
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "Invalid API key" }, 401)]);
    const adapter = createBouncerAdapter({ apiKey: "bad-key" });
    await expect(adapter.verifyEmail("jane@acme.com")).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createBouncerAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk verifies through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_DELIVERABLE), jsonResponse(MOCK_RISKY)]);
    const adapter = createBouncerAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.verifyBulk(
      [{ email: "jane@acme.com" }, { email: "boss@acme.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("reads the credit balance", async () => {
    mockFetchQueue([jsonResponse({ credits: 500 })]);
    const adapter = createBouncerAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(500);
  });
});
