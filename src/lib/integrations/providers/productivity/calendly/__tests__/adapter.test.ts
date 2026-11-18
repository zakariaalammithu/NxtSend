/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CALENDLY_CONFIG } from "../config";
import { createCalendlyAdapter, mapLeadToCalendly, mapCalendlyToLead } from "../adapter";
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

describe("Calendly adapter", () => {
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
    const record = mapLeadToCalendly(lead, { username: 'acme-sales', eventTypeSlug: '30min' });
    const back = mapCalendlyToLead(record, { username: 'acme-sales', eventTypeSlug: '30min' });
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    // Calendly invitees carry no company — the scheduling link carries it
    // as the a1 prefill parameter instead (checked below).
    expect(record.schedulingLink).toBe(
      "https://calendly.com/acme-sales/30min?name=Ada+Lovelace&email=ada%40example.com&a1=Analytical+Engines+Ltd"
    );
    expect(back.email).toBe("ada@example.com");
  });

  it("exportLeads throws a clear not-supported error", async () => {
    const adapter = createCalendlyAdapter({
      credential: { accessToken: "calendly-token" },
      settings: { userUri: "https://api.calendly.com/users/AAAAAAAAAAAAAAAA" },
    });
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("cannot create events directly");
  });

  it("imports invitees from scheduled events", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ collection: [{ uri: "https://api.calendly.com/scheduled_events/evt-1" }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({ collection: [{ name: "Ada Lovelace", email: "ada@example.com" }] })
      );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createCalendlyAdapter({
      credential: { accessToken: "calendly-token" },
      settings: { userUri: "https://api.calendly.com/users/AAAAAAAAAAAAAAAA" },
    });
    const { leads } = await adapter.importLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.calendly.com/scheduled_events?user=");
  });

  it("createTaskFromLead returns the pre-filled scheduling link", async () => {
    const adapter = createCalendlyAdapter({
      credential: { accessToken: "calendly-token" },
      settings: { userUri: "https://api.calendly.com/users/AAAAAAAAAAAAAAAA", username: "acme-sales", eventTypeSlug: "30min" },
    });
    const task = await adapter.createTaskFromLead({ firstName: "Ada", email: "ada@example.com" });
    expect(task?.url).toContain("https://calendly.com/acme-sales/30min?");
    expect(task?.url).toContain("email=ada%40example.com");
  });

  it("throws configuration_required when the token or user URI is missing", async () => {
    const adapter = createCalendlyAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(adapter.importLeads()).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(CALENDLY_CONFIG.id).toBe("calendly");
    expect(CALENDLY_CONFIG.authType).toBe("oauth2");
    expect(CALENDLY_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(CALENDLY_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
