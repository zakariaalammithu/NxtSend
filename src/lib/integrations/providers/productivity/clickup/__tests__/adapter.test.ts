/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CLICKUP_CONFIG } from "../config";
import { createClickupAdapter, mapLeadToClickup, mapClickupToLead } from "../adapter";
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

describe("ClickUp adapter", () => {
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
    const record = mapLeadToClickup(lead, {});
    const back = mapClickupToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.name).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.description).toContain("Email: ada@example.com");
    expect(back.email).toBe("ada@example.com");
  });

  it("exports one task per lead", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ id: "task123", url: "https://app.clickup.com/t/task123" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createClickupAdapter({
      credential: { apiKey: "pk_test" },
      settings: { listId: "123456789" },
    });
    const result = await adapter.exportLeads([{ firstName: "Ada", email: "ada@example.com" }]);
    expect(result.created).toBe(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.clickup.com/api/v2/list/123456789/task");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pk_test");
    expect(String(init.body)).toContain("Follow up: Ada");
  });

  it("creates a task with a unix-ms due date", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ id: "task123", url: "https://app.clickup.com/t/task123" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createClickupAdapter({
      credential: { apiKey: "pk_test" },
      settings: { listId: "123456789" },
    });
    await adapter.createTaskFromLead({ firstName: "Ada", email: "ada@example.com" }, { dueDate: "2026-11-25" });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).due_date).toBe(new Date("2026-11-25").getTime());
  });

  it("imports tasks from the list", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        tasks: [
          { id: "task123", name: "Follow up: Ada Lovelace", description: "Email: ada@example.com", status: { status: "in progress" } },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createClickupAdapter({
      credential: { apiKey: "pk_test" },
      settings: { listId: "123456789" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    expect(leads[0].status).toBe("in progress");
  });

  it("throws configuration_required when the token or list is missing", async () => {
    const adapter = createClickupAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(CLICKUP_CONFIG.id).toBe("clickup");
    expect(CLICKUP_CONFIG.authType).toBe("api_key");
    expect(CLICKUP_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(CLICKUP_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
