/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRELLO_CONFIG } from "../config";
import { createTrelloAdapter, mapLeadToTrello, mapTrelloToLead } from "../adapter";
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

describe("Trello adapter", () => {
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
    const record = mapLeadToTrello(lead, {});
    const back = mapTrelloToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.name).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.desc).toContain("Email: ada@example.com");
    expect(back.email).toBe("ada@example.com");
  });

  it("exports one card per lead with key+token in the query", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ id: "card123", shortUrl: "https://trello.com/c/card123" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTrelloAdapter({
      credential: { apiKey: "trello-token", extra: { apiKey: "trello-key" } },
      settings: { listId: "list123" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.trello.com/1/cards?");
    expect(url).toContain("key=trello-key");
    expect(url).toContain("token=trello-token");
    expect(url).toContain("idList=list123");
  });

  it("imports cards from the list", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse([
        { id: "card123", name: "Follow up: Ada Lovelace", desc: "Follow up with Ada Lovelace.\nEmail: ada@example.com" },
      ])
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createTrelloAdapter({
      credential: { apiKey: "trello-token", extra: { apiKey: "trello-key" } },
      settings: { listId: "list123" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].sourceId).toBe("card123");
  });

  it("throws configuration_required when key, token or list is missing", async () => {
    const adapter = createTrelloAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(TRELLO_CONFIG.id).toBe("trello");
    expect(TRELLO_CONFIG.authType).toBe("api_key");
    expect(TRELLO_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(TRELLO_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
