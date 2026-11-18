/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NOTION_CONFIG } from "../config";
import { createNotionAdapter, mapLeadToNotion, mapNotionToLead } from "../adapter";
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Notion adapter", () => {
  it("maps a lead to the provider shape and back without losing fields", () => {
    const lead = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines Ltd",
      jobTitle: "Mathematician",
      linkedinUrl: "https://www.linkedin.com/in/adalovelace",
      tags: ["interested", "uk"],
      status: "new",
    };
    const record = mapLeadToNotion(lead, {});
    const back = mapNotionToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record["Email"]).toEqual({ email: "ada@example.com" });
    expect(back.tags).toEqual(["interested", "uk"]);
  });

  it("upserts by email: creates new pages, patches existing ones", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "page-new" }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: "page-old" }] }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createNotionAdapter({
      credential: { apiKey: "secret_test" },
      settings: { databaseId: "db123" },
    });
    const result = await adapter.exportLeads([
      { firstName: "Ada", email: "ada@example.com" },
      { firstName: "Grace", email: "grace@example.com" },
    ]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Notion-Version"]).toBe("2022-06-28");
  });

  it("imports database rows across pages", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            properties: {
              Name: { type: "title", title: [{ plain_text: "Ada Lovelace" }] },
              Email: { type: "email", email: "ada@example.com" },
              Company: { type: "rich_text", rich_text: [{ plain_text: "Analytical Engines" }] },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createNotionAdapter({
      credential: { apiKey: "secret_test" },
      settings: { databaseId: "db123" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].firstName).toBe("Ada");
    expect(leads[0].lastName).toBe("Lovelace");
    expect(leads[0].company).toBe("Analytical Engines");
  });

  it("throws configuration_required when the token or database id is missing", async () => {
    const adapter = createNotionAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(NOTION_CONFIG.id).toBe("notion");
    expect(NOTION_CONFIG.authType).toBe("api_key");
    expect(NOTION_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(NOTION_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
