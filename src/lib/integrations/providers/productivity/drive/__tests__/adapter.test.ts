/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DRIVE_CONFIG } from "../config";
import { createDriveAdapter, mapLeadToDrive, mapDriveToLead } from "../adapter";
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

describe("Google Drive adapter", () => {
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
    const record = mapLeadToDrive(lead, {});
    const back = mapDriveToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(back.tags).toEqual(["interested", "uk"]);
  });

  it("exports by creating a spreadsheet file in Drive", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ id: "sheet123", webViewLink: "https://docs.google.com/spreadsheets/d/sheet123" })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createDriveAdapter({
      credential: { accessToken: "ya29.test" },
      settings: {},
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    expect(result.createdIds).toEqual(["sheet123"]);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/drive/v3/files");
    expect(String(init.body)).toContain("application/vnd.google-apps.spreadsheet");
  });

  it("imports by exporting the sheet as CSV and parsing rows", async () => {
    const csv = "First Name,Last Name,Email,Company\nAda,Lovelace,ada@example.com,Analytical Engines\n";
    const fetchSpy = vi.fn(async () => new Response(csv, { status: 200, headers: { "content-type": "text/csv" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createDriveAdapter({
      credential: { accessToken: "ya29.test" },
      settings: { fileId: "sheet123" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/drive/v3/files/sheet123/export?mimeType=text%2Fcsv");
  });

  it("createTaskFromLead throws a clear not-supported error", async () => {
    const adapter = createDriveAdapter({ credential: { accessToken: "ya29.test" }, settings: {} });
    await expect(adapter.createTaskFromLead({ firstName: "Ada" })).rejects.toThrow("not supported");
  });

  it("throws configuration_required when the token is missing", async () => {
    const adapter = createDriveAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(DRIVE_CONFIG.id).toBe("google-drive");
    expect(DRIVE_CONFIG.authType).toBe("oauth2");
    expect(DRIVE_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(DRIVE_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
