/**
 * Apify adapter tests — mocked fetch only.
 * Payloads are MOCK responses shaped like Apify's documented API
 * v2 run/dataset responses; they are not real Apify data.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySyncJobStore } from "../../../sync";
import { instantSleep, jsonResponse, mockFetchQueue } from "../../../test-utils";
import { createApifyAdapter } from "../adapter";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeAdapter() {
  return createApifyAdapter({
    apiKey: "mock-apify-token",
    actorId: "mock-user~mock-actor",
    sleep: instantSleep,
    pollIntervalMs: 0,
  });
}

describe("Apify adapter", () => {
  it("starts an Actor run, polls to SUCCEEDED, and reads dataset items", async () => {
    const spy = mockFetchQueue([
      jsonResponse({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } }),
      jsonResponse({ data: { status: "RUNNING", defaultDatasetId: "ds-1" } }),
      jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-1" } }),
      jsonResponse([
        { email: "jane@acme.com", firstName: "Jane", lastName: "Doe", company: "Acme" },
      ]),
    ]);
    const adapter = makeAdapter();
    const result = await adapter.enrichLead({ email: "jane@acme.com" });
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
    expect(result.fields.first_name?.value).toBe("Jane");
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.fields.email?.source).toBe("apify:mock-user~mock-actor");
    expect(spy.mock.calls[0][0]).toBe(
      "https://api.apify.com/v2/acts/mock-user~mock-actor/runs"
    );
    expect(spy.mock.calls[3][0]).toBe("https://api.apify.com/v2/datasets/ds-1/items");
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mock-apify-token");
  });

  it("throws when the run ends FAILED", async () => {
    mockFetchQueue([
      jsonResponse({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } }),
      jsonResponse({ data: { status: "FAILED", defaultDatasetId: "ds-1" } }),
    ]);
    const adapter = makeAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toThrow(
      /status FAILED/
    );
  });

  it("returns unmatched when the dataset is empty", async () => {
    mockFetchQueue([
      jsonResponse({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "SUCCEEDED" } }),
      jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-1" } }),
      jsonResponse([]),
    ]);
    const adapter = makeAdapter();
    const result = await adapter.enrichLead({ email: "nobody@acme.com" });
    expect(result.matched).toBe(false);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: { type: "invalid-token" } }, 401)]);
    const adapter = makeAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_auth_failed",
    });
  });

  it("throws provider_credentials_missing without a token or actor id", () => {
    expect(() =>
      createApifyAdapter({ apiKey: "", actorId: "a~b" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
    expect(() =>
      createApifyAdapter({ apiKey: "k", actorId: "" })
    ).toThrowError(expect.objectContaining({ code: "provider_credentials_missing" }));
  });

  it("bulk enriches through a sync job", async () => {
    mockFetchQueue([
      jsonResponse({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "SUCCEEDED" } }),
      jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-1" } }),
      jsonResponse([{ email: "jane@acme.com" }]),
      jsonResponse({ data: { id: "run-2", defaultDatasetId: "ds-2", status: "SUCCEEDED" } }),
      jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-2" } }),
      jsonResponse([]),
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
