/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SHEETS_CONFIG } from "../config";
import { createSheetsAdapter, mapLeadToSheets, mapSheetsToLead } from "../adapter";
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

describe("Google Sheets adapter", () => {
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
    const record = mapLeadToSheets(lead, {});
    const back = mapSheetsToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(back.tags).toEqual(["interested", "uk"]);
    expect(back.status).toBe("new");
  });

  it("exports deduped leads via values.append", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ updates: { updatedRows: 2, updatedRange: "Leads!A3:H4" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSheetsAdapter({
      credential: { accessToken: "ya29.test" },
      settings: { spreadsheetId: "abc123" },
    });
    const result = await adapter.exportLeads([
      { firstName: "Ada", email: "ada@example.com" },
      { firstName: "Grace", email: "grace@example.com" },
      { firstName: "Ada Again", email: "ADA@example.com" },
    ]);
    expect(result.processed).toBe(3);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://sheets.googleapis.com/v4/spreadsheets/abc123/values/Leads!A1%3AH:append");
    expect(url).toContain("valueInputOption=USER_ENTERED");
  });

  it("imports rows keyed by the header row", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        values: [
          ["First Name", "Last Name", "Email", "Company", "Job Title", "LinkedIn URL", "Tags", "Status"],
          ["Ada", "Lovelace", "ada@example.com", "Analytical Engines", "Mathematician", "", "interested", "new"],
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSheetsAdapter({
      credential: { accessToken: "ya29.test" },
      settings: { spreadsheetId: "abc123" },
    });
    const { leads, errors } = await adapter.importLeads();
    expect(errors).toEqual([]);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].tags).toEqual(["interested"]);
  });

  it("throws configuration_required when the token or spreadsheet id is missing", async () => {
    const adapter = createSheetsAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("surfaces a provider HTTP error as a throw (caller records it on the sync job)", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: { message: "The caller does not have permission" } }, 403));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createSheetsAdapter({
      credential: { accessToken: "ya29.test" },
      settings: { spreadsheetId: "abc123" },
    });
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("403");
  });

  it("config declares honest metadata", () => {
    expect(SHEETS_CONFIG.id).toBe("google-sheets");
    expect(SHEETS_CONFIG.authType).toBe("oauth2");
    expect(SHEETS_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(SHEETS_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
