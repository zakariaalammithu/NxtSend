/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LINEAR_CONFIG } from "../config";
import { createLinearAdapter, mapLeadToLinear, mapLinearToLead } from "../adapter";
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

describe("Linear adapter", () => {
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
    const record = mapLeadToLinear(lead, {});
    const back = mapLinearToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.title).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.description).toContain("Email: ada@example.com");
    expect(back.email).toBe("ada@example.com");
  });

  it("creates issues via the issueCreate mutation", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ data: { issueCreate: { success: true, issue: { id: "uuid-1", identifier: "ENG-42", url: "https://linear.app/team/issue/ENG-42" } } } })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createLinearAdapter({
      credential: { apiKey: "lin_api_test" },
      settings: { teamId: "team-uuid-1" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    expect(result.createdIds).toEqual(["ENG-42"]);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.linear.app/graphql");
    expect(String(init.body)).toContain("issueCreate");
    expect(String(init.body)).toContain("team-uuid-1");
  });

  it("imports issues, keeping only this team's", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        data: {
          issues: {
            nodes: [
              { id: "1", identifier: "ENG-42", title: "Follow up: Ada Lovelace", description: "Email: ada@example.com", team: { id: "team-uuid-1" } },
              { id: "2", identifier: "OTH-1", title: "Follow up: Someone Else", description: "Email: other@example.com", team: { id: "team-other" } },
            ],
          },
        },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createLinearAdapter({
      credential: { apiKey: "lin_api_test" },
      settings: { teamId: "team-uuid-1" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].sourceId).toBe("ENG-42");
  });

  it("surfaces a GraphQL error as a failed export, not a throw", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ errors: [{ message: "Team not found" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createLinearAdapter({
      credential: { apiKey: "lin_api_test" },
      settings: { teamId: "team-uuid-1" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Team not found");
  });

  it("throws configuration_required when the key or team is missing", async () => {
    const adapter = createLinearAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(LINEAR_CONFIG.id).toBe("linear");
    expect(LINEAR_CONFIG.authType).toBe("api_key");
    expect(LINEAR_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(LINEAR_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
