/**
 * MillionVerifier adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like MillionVerifier's
 * documented /api/v3/ response; they are not real MillionVerifier
 * data. The classification assertions check VERBATIM preservation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createMillionVerifierAdapter } from "../adapter";

// MOCK — shaped like MillionVerifier's documented v3 response.
const MOCK_CATCH_ALL = {
  email: "jane@acme.com",
  result: "catch_all",
  resultcode: 1,
  subresult: "catch_all",
  quality: "0.8",
  free: false,
  role: false,
  didyoumean: "",
  credits: 42,
};

const MOCK_OK = {
  email: "jane@acme.com",
  result: "ok",
  resultcode: 1,
  subresult: "ok",
  quality: "0.9",
  free: false,
  role: false,
  didyoumean: "",
  credits: 41,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MillionVerifier adapter", () => {
  it("verifies an email and preserves the verbatim catch_all classification", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_CATCH_ALL)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createMillionVerifierAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("catch_all");
    expect(result.isCatchAll).toBe(true);
    expect(result.substatus).toBe("catch_all");
    expect(result.creditsUsed).toBe(1);
    expect(result.creditsRemaining).toBe(42);
    expect(calls).toEqual([{ event: "millionverifier.verify", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain("https://api.millionverifier.com/api/v3/");
    expect(spy.mock.calls[0][0]).toContain("email=jane%40acme.com");
  });

  it("preserves the ok classification verbatim", async () => {
    mockFetchQueue([jsonResponse(MOCK_OK)]);
    const adapter = createMillionVerifierAdapter({ apiKey: "mock-key" });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("ok");
    expect(result.isCatchAll).toBe(false);
  });

  it("treats result 'error' as a provider error, not a classification", async () => {
    mockFetchQueue([
      jsonResponse({ email: "jane@acme.com", result: "error", subresult: "invalid_api_key" }),
    ]);
    const adapter = createMillionVerifierAdapter({ apiKey: "bad-key" });
    await expect(adapter.verifyEmail("jane@acme.com")).rejects.toMatchObject({
      code: "provider_verification_error",
    });
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createMillionVerifierAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk verifies through a sync job and dedupes by email", async () => {
    mockFetchQueue([jsonResponse(MOCK_OK), jsonResponse(MOCK_CATCH_ALL)]);
    const adapter = createMillionVerifierAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const updated: Array<{ id: string; patch: unknown }> = [];
    const result = await adapter.verifyBulk(
      [
        { leadId: "lead-1", email: "jane@acme.com" },
        { email: "JANE@acme.com" },
        { leadId: "lead-2", email: "boss@acme.com" },
      ],
      {
        workspaceId: "ws-1",
        syncJobStore: store,
        updateLead: async (id, patch) => {
          updated.push({ id, patch });
        },
      }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(updated).toHaveLength(2);
    // The lead patch keeps the classification verbatim.
    const patch = updated[1].patch as { custom_fields: Record<string, { classification: string }> };
    expect(patch.custom_fields.email_verification_millionverifier.classification).toBe("catch_all");
  });

  it("reads the credit balance", async () => {
    mockFetchQueue([jsonResponse({ credits: 1234 })]);
    const adapter = createMillionVerifierAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(1234);
  });
});
