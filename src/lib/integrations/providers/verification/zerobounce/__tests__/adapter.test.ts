/**
 * ZeroBounce adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like ZeroBounce's documented
 * API v2 responses; they are not real ZeroBounce data. The
 * classification assertions check VERBATIM preservation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { createUsageSpy, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createZeroBounceAdapter } from "../adapter";

// MOCK — shaped like ZeroBounce's documented /v2/validate response.
const MOCK_CATCH_ALL = {
  address: "jane@acme.com",
  status: "catch-all",
  sub_status: "mailbox_not_found",
  free_email: false,
  did_you_mean: null,
  account: null,
  domain: "acme.com",
  mx_found: "true",
  processed_at: "2026-11-19 00:00:00.000",
};

const MOCK_VALID = {
  address: "jane@acme.com",
  status: "valid",
  sub_status: "",
  free_email: false,
  did_you_mean: null,
  processed_at: "2026-11-19 00:00:00.000",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ZeroBounce adapter", () => {
  it("verifies an email and preserves the verbatim catch-all classification", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_CATCH_ALL)]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createZeroBounceAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("catch-all");
    expect(result.substatus).toBe("mailbox_not_found");
    expect(result.isCatchAll).toBe(true);
    expect(result.creditsUsed).toBe(1);
    expect(calls).toEqual([{ event: "zerobounce.validate", creditsUsed: 1 }]);
    expect(spy.mock.calls[0][0]).toContain("https://api.zerobounce.net/v2/validate");
  });

  it("charges 0 credits for an unknown result", async () => {
    mockFetchQueue([jsonResponse({ ...MOCK_VALID, status: "unknown", sub_status: "timeout" })]);
    const { calls, recorder } = createUsageSpy();
    const adapter = createZeroBounceAdapter({ apiKey: "mock-key", recordUsage: recorder });
    const result = await adapter.verifyEmail("jane@acme.com");
    expect(result.classification).toBe("unknown");
    expect(result.creditsUsed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("throws provider_credentials_missing without an API key", () => {
    expect(() => createZeroBounceAdapter({ apiKey: "" })).toThrowError(
      expect.objectContaining({ code: "provider_credentials_missing" })
    );
  });

  it("bulk verifies via the native validatebatch endpoint in one sync job", async () => {
    const spy = mockFetchQueue([
      jsonResponse({
        email_batch: [
          { ...MOCK_VALID, address: "jane@acme.com" },
          { ...MOCK_CATCH_ALL, address: "boss@acme.com" },
        ],
      }),
    ]);
    const adapter = createZeroBounceAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const updated: string[] = [];
    const result = await adapter.verifyBulk(
      [
        { leadId: "lead-1", email: "jane@acme.com" },
        { leadId: "lead-2", email: "boss@acme.com" },
        { email: "JANE@acme.com" },
      ],
      {
        workspaceId: "ws-1",
        syncJobStore: store,
        updateLead: async (id) => {
          updated.push(id);
        },
      }
    );
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(updated).toEqual(["lead-1", "lead-2"]);
    expect(spy.mock.calls[0][0]).toBe("https://api.zerobounce.net/v2/validatebatch");
  });

  it("falls back to single checks when the batch call fails", async () => {
    mockFetchQueue([
      jsonResponse({ error: "batch unavailable" }, 503),
      jsonResponse({ error: "batch unavailable" }, 503),
      jsonResponse({ error: "batch unavailable" }, 503),
      jsonResponse(MOCK_VALID),
    ]);
    const adapter = createZeroBounceAdapter({ apiKey: "mock-key" });
    const store = createMemorySyncJobStore();
    const result = await adapter.verifyBulk(
      [{ email: "jane@acme.com" }],
      { workspaceId: "ws-1", syncJobStore: store }
    );
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("reads the credit balance", async () => {
    mockFetchQueue([jsonResponse({ credits: "1234" })]);
    const adapter = createZeroBounceAdapter({ apiKey: "mock-key" });
    await expect(adapter.getCreditBalance()).resolves.toBe(1234);
  });
});
