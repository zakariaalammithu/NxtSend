/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIRTABLE_CONFIG } from "../config";
import { createAirtableAdapter, mapLeadToAirtable, mapAirtableToLead } from "../adapter";
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

describe("Airtable adapter", () => {
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
    const record = mapLeadToAirtable(lead, {});
    const back = mapAirtableToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.fields["Email"]).toBe("ada@example.com");
    expect(back.tags).toEqual(["interested", "uk"]);
  });

  it("exports in chunks of 10", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { records: unknown[] };
      return jsonResponse({ records: body.records.map((_, i) => ({ id: "rec" + i })) });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAirtableAdapter({
      credential: { apiKey: "patTest" },
      settings: { baseId: "appABC", tableId: "tblXYZ" },
    });
    const leads = Array.from({ length: 12 }, (_, i) => ({ firstName: "Lead" + i, email: "lead" + i + "@example.com" }));
    const result = await adapter.exportLeads(leads);
    expect(result.created).toBe(12);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, init2] = fetchSpy.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init2.body)).records).toHaveLength(2);
  });

  it("imports across paged responses and dedupes by email", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          records: [{ fields: { "First Name": "Ada", Email: "ada@example.com" } }],
          offset: "next",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ records: [{ fields: { "First Name": "Ada2", Email: "ADA@example.com" } }] })
      );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAirtableAdapter({
      credential: { apiKey: "patTest" },
      settings: { baseId: "appABC", tableId: "tblXYZ" },
    });
    const { leads, errors } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("counts a failed batch instead of throwing the whole export", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: "NOT_FOUND" }, 404));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAirtableAdapter({
      credential: { apiKey: "patTest" },
      settings: { baseId: "appABC", tableId: "tblXYZ" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it("config declares honest metadata", () => {
    expect(AIRTABLE_CONFIG.id).toBe("airtable");
    expect(AIRTABLE_CONFIG.authType).toBe("api_key");
    expect(AIRTABLE_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(AIRTABLE_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
