/**
 * Clay adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Clay's documented Public
 * API routine run/results flow (developers.clay.com); they are not
 * real Clay data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { instantSleep, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createClayAdapter } from "../adapter";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeAdapter() {
  return createClayAdapter({
    apiKey: "mock-clay-key",
    routineId: "mock-routine-id",
    sleep: instantSleep,
    pollIntervalMs: 0,
  });
}

describe("Clay adapter", () => {
  it("runs a routine and maps its outputs onto lead fields", async () => {
    const spy = mockFetchQueue([
      jsonResponse({ routine_run_id: "mock-run-id" }),
      jsonResponse({ status: "running", results: [] }),
      jsonResponse({
        status: "complete",
        results: [
          {
            id: "lead-1",
            outputs: {
              email: "jane@acme.com",
              "Job Title": "Director of Product",
              Company: "Acme",
              "Work Email": "jane@acme.com",
            },
          },
        ],
      }),
    ]);
    const adapter = makeAdapter();
    const result = await adapter.enrichLead({
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
    });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
    expect(result.fields.job_title?.value).toBe("Director of Product");
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.fields.email?.source).toBe("clay:mock-routine-id");
    expect(spy.mock.calls[0][0]).toBe(
      "https://api.clay.com/public/v0/routines/mock-routine-id/run"
    );
    expect(spy.mock.calls[1][0]).toBe(
      "https://api.clay.com/public/v0/routines/run/mock-run-id/results"
    );
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["clay-api-key"]).toBe("mock-clay-key");
  });

  it("returns unmatched when the routine returns no outputs", async () => {
    mockFetchQueue([
      jsonResponse({ routine_run_id: "mock-run-id" }),
      jsonResponse({ status: "complete", results: [{ id: "lead-1", outputs: {} }] }),
    ]);
    const adapter = makeAdapter();
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "unauthorized" }, 401)]);
    const adapter = makeAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without an API key or routine id", () => {
    expect(() =>
      createClayAdapter({ apiKey: "", routineId: "r" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
    expect(() =>
      createClayAdapter({ apiKey: "k", routineId: "" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([
      jsonResponse({ routine_run_id: "run-1" }),
      jsonResponse({ status: "complete", results: [{ outputs: { email: "jane@acme.com" } }] }),
      jsonResponse({ routine_run_id: "run-2" }),
      jsonResponse({ status: "complete", results: [{ outputs: {} }] }),
    ]);
    const adapter = makeAdapter();
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
