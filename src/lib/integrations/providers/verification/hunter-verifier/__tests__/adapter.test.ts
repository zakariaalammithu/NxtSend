/**
 * Hunter Email Verifier adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Hunter's documented
 * API v2 /email-verifier response; they are not real Hunter data.
 * The classification assertions check VERBATIM preservation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createHunterVerifierAdapter } from "../adapter";

// MOCK — shaped like Hunter's documented /email-verifier response.
const MOCK_RISKY = {
  data: {
    status: "risky",
    result: "risky",
    score: 55,
    email: "jane@acme.com",
    regexp: true,
    gibberish: false,
    disposable: false,
    webmail: false,
    mx_records: true,
    smtp_server: true,
    smtp_check: false,
    accept_all: true,
    block: false,
    sources: [],
  },
};

const MOCK_DELIVERABLE = {
  data: {
    status: "deliverable",
    result: "deliverable",
    score: 97,
    email: "jane@acme.com",
    regexp: true,
    gibberish: false,
    disposable: false,
    webmail: false,
    mx_records: true,
    smtp_server: true,
    smtp_check: true,
    accept_all: false,
    block: false,
    sources: [{ domain: "acme.com", uri: "https://acme.com/team" }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Hunter Email Verifier adapter", () => {
  it("verifies an email and preserves the verbatim risky classification", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_RISKY)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createHunterVerifierAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("risky");
    expect(result.substatus).toBe("risky");
    expect(result.score).toBe(55);
    expect(result.isCatchAll).toBe(true);
    expect(result.isDisposable).toBe(false);
    expect(result.creditsUsed).toBe(1);
    expect(calls).toEqual([{ event: "hunter.email-verifier", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain("https://api.hunter.io/v2/email-verifier");
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("mock-key");
  });

  it("preserves the deliverable classification verbatim", async () => {
    mockFetchQueue([jsonResponse(MOCK_DELIVERABLE)]);
    const adapter = createHunterVerifierAdapter({ apiKey: "mock-key" });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("deliverable");
    expect(result.score).toBe(97);
    expect(result.isCatchAll).toBe(false);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ errors: [{ details: "Invalid API key" }] }, 401)]);
    const adapter = createHunterVerifierAdapter({ apiKey: "bad-key" });
    await expect(adapter.verifyEmail("jane@acme.com")).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createHunterVerifierAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk verifies through a sync job", async () => {
    mockFetchQueue([jsonResponse(MOCK_DELIVERABLE), jsonResponse(MOCK_RISKY)]);
    const adapter = createHunterVerifierAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.verifyBulk(
      [{ email: "jane@acme.com" }, { email: "boss@acme.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("reads the remaining verifications from /account", async () => {
    mockFetchQueue([
      jsonResponse({ data: { requests: { verifications: { available: 17 } } } }),
    ]);
    const adapter = createHunterVerifierAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(17);
  });
});
