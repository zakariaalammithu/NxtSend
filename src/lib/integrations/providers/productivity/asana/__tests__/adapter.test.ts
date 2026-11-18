/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ASANA_CONFIG } from "../config";
import { createAsanaAdapter, mapLeadToAsana, mapAsanaToLead } from "../adapter";
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

describe("Asana adapter", () => {
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
    const record = mapLeadToAsana(lead, {});
    const back = mapAsanaToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.name).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.notes).toContain("Email: ada@example.com");
    expect(back.email).toBe("ada@example.com");
  });

  it("exports one task per lead", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ data: { gid: "1201234567890123" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAsanaAdapter({
      credential: { accessToken: "asana-pat" },
      settings: { projectGid: "1209999999999999" },
    });
    const result = await adapter.exportLeads([
      { firstName: "Ada", email: "ada@example.com" },
      { firstName: "Grace", email: "grace@example.com" },
    ]);
    expect(result.created).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.asana.com/api/1.0/tasks");
    expect(String(init.body)).toContain("1209999999999999");
  });

  it("creates a task with a due date from an interested lead", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ data: { gid: "1201234567890123", permalink_url: "https://app.asana.com/0/1/1201234567890123" } })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAsanaAdapter({
      credential: { accessToken: "asana-pat" },
      settings: { projectGid: "1209999999999999" },
    });
    const task = await adapter.createTaskFromLead(
      { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", company: "Analytical Engines Ltd" },
      { dueDate: "2026-11-25" }
    );
    expect(task?.id).toBe("1201234567890123");
    expect(task?.url).toContain("app.asana.com");
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toContain("2026-11-25");
  });

  it("imports tasks back to leads", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            gid: "1201234567890123",
            name: "Follow up: Ada Lovelace (Analytical Engines Ltd)",
            notes: "Follow up with Ada Lovelace.\nEmail: ada@example.com\nCompany: Analytical Engines Ltd",
            completed: false,
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createAsanaAdapter({
      credential: { accessToken: "asana-pat" },
      settings: { projectGid: "1209999999999999" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].status).toBe("open");
  });

  it("throws configuration_required when the token or project is missing", async () => {
    const adapter = createAsanaAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(ASANA_CONFIG.id).toBe("asana");
    expect(ASANA_CONFIG.authType).toBe("oauth2");
    expect(ASANA_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(ASANA_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
