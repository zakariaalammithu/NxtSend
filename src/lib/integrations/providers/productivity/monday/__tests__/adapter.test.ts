/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MONDAY_CONFIG } from "../config";
import { createMondayAdapter, mapLeadToMonday, mapMondayToLead } from "../adapter";
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

describe("Monday.com adapter", () => {
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
    const record = mapLeadToMonday(lead, {});
    const back = mapMondayToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.name).toBe("Ada Lovelace");
    expect(record.columnValues["Email"]).toBe("ada@example.com");
    expect(back.email).toBe("ada@example.com");
  });

  it("exports one item per lead, resolving columns by title first", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            boards: [
              {
                columns: [
                  { id: "text0", title: "First Name" },
                  { id: "text1", title: "Email" },
                ],
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: { create_item: { id: "987654321" } } }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createMondayAdapter({
      credential: { apiKey: "monday-token" },
      settings: { boardId: "1234567890" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    expect(result.createdIds).toEqual(["987654321"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url2, init2] = fetchSpy.mock.calls[1] as unknown as [string, RequestInit];
    expect(url2).toBe("https://api.monday.com/v2");
    expect((init2.headers as Record<string, string>).Authorization).toBe("monday-token");
    expect(String(init2.body)).toContain("create_item");
  });

  it("imports board items via items_page", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        data: {
          boards: [
            {
              items_page: {
                items: [
                  {
                    id: "111",
                    name: "Ada Lovelace",
                    column_values: [
                      { id: "text1", text: "ada@example.com", column: { title: "Email" } },
                      { id: "text2", text: "Analytical Engines", column: { title: "Company" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createMondayAdapter({
      credential: { apiKey: "monday-token" },
      settings: { boardId: "1234567890" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].company).toBe("Analytical Engines");
    expect(leads[0].sourceId).toBe("111");
  });

  it("throws configuration_required when the token or board id is missing", async () => {
    const adapter = createMondayAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(MONDAY_CONFIG.id).toBe("monday");
    expect(MONDAY_CONFIG.authType).toBe("api_key");
    expect(MONDAY_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(MONDAY_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
