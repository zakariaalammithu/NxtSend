/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JIRA_CONFIG } from "../config";
import { createJiraAdapter, mapLeadToJira, mapJiraToLead } from "../adapter";
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

describe("Jira adapter", () => {
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
    const record = mapLeadToJira(lead, {});
    const back = mapJiraToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.summary).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.description).toBeTruthy();
    expect(back.email).toBe("ada@example.com");
  });

  it("creates issues with an ADF description", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ id: "10001", key: "OPS-42", self: "https://acme.atlassian.net/rest/api/3/issue/10001" })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createJiraAdapter({
      credential: { apiKey: "jira-token", extra: { email: "ops@acme.com", siteDomain: "acme", projectKey: "OPS" } },
      settings: {},
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    expect(result.createdIds).toEqual(["OPS-42"]);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/issue");
    expect((init.headers as Record<string, string>).Authorization).toContain("Basic ");
    const body = JSON.parse(String(init.body));
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.project.key).toBe("OPS");
  });

  it("imports issues via JQL search", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        issues: [
          {
            key: "OPS-42",
            fields: {
              summary: "Follow up: Ada Lovelace",
              description: {
                type: "doc",
                version: 1,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Follow up with Ada Lovelace." }] },
                  { type: "paragraph", content: [{ type: "text", text: "Email: ada@example.com" }] },
                ],
              },
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createJiraAdapter({
      credential: { apiKey: "jira-token", extra: { email: "ops@acme.com", siteDomain: "acme", projectKey: "OPS" } },
      settings: {},
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].sourceId).toBe("OPS-42");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/api/3/search/jql?");
    expect(url).toContain("project");
  });

  it("throws configuration_required when site, email, token or project is missing", async () => {
    const adapter = createJiraAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(JIRA_CONFIG.id).toBe("jira");
    expect(JIRA_CONFIG.authType).toBe("api_key");
    expect(JIRA_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(JIRA_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
