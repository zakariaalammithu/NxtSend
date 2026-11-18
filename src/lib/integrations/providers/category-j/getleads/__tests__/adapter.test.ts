/**
 * GetLeads adapter tests — MOCK TESTED ONLY.
 * All payloads below are MOCK responses shaped like GetLeads'
 * documented responses (https://www.getleads.io/docs/). No real
 * network, no real credentials: the API key is a placeholder.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGetLeadsAdapter,
  getLeadsContactToLead,
} from "../adapter";
import {
  fetchCalls,
  firstRequestUrl,
  jsonResponse,
  mockFetchQueue,
  createUsageSpy,
} from "../../../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MOCK_CONTACT_ROW = {
  full_name: "Jane Example",
  first_name: "Jane",
  last_name: "Example",
  current_title: "VP Sales",
  work_email: "jane@example.com",
  email_status: "VALID",
  company_name: "Example Ltd",
  company_domain: "example.com",
  linkedin_url: "https://www.linkedin.com/in/jane-example",
  direct_dial: "+1-555-0100",
};

describe("getLeadsContactToLead (MOCK TESTED)", () => {
  it("maps a documented contact row onto a lead", () => {
    const lead = getLeadsContactToLead(MOCK_CONTACT_ROW);
    expect(lead.email).toBe("jane@example.com");
    expect(lead.firstName).toBe("Jane");
    expect(lead.lastName).toBe("Example");
    expect(lead.jobTitle).toBe("VP Sales");
    expect(lead.company).toBe("Example Ltd");
    expect(lead.companyDomain).toBe("example.com");
    expect(lead.linkedinUrl).toBe("https://www.linkedin.com/in/jane-example");
  });

  it("splits full_name when first/last name fields are absent", () => {
    const lead = getLeadsContactToLead({ full_name: "Ada Lovelace" });
    expect(lead.firstName).toBe("Ada");
    expect(lead.lastName).toBe("Lovelace");
  });
});

describe("createGetLeadsAdapter (MOCK TESTED)", () => {
  it("enrichLead by email posts to /enrich/from-email with a Bearer key", async () => {
    const spy = mockFetchQueue([
      jsonResponse({
        results: [
          {
            success: true,
            email: "jane@example.com",
            data: { ...MOCK_CONTACT_ROW },
          },
        ],
        creditsRemaining: 42,
      }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const result = await adapter.enrichLead({ email: "jane@example.com" });

    expect(firstRequestUrl(spy)).toContain("/api/v1/enrich/from-email");
    const init = fetchCalls(spy)[0][1];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer key_test"
    );
    expect(firstRequestUrl(spy)).not.toContain("key_test");
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@example.com");
    expect(result.fields.email_status?.value).toBe("VALID");
    expect(result.creditsUsed).toBe(1);
    expect(result.creditsRemaining).toBe(42);
  });

  it("enrichLead by LinkedIn URL posts to /enrich/from-linkedin", async () => {
    const spy = mockFetchQueue([
      jsonResponse({
        results: [{ success: true, data: { ...MOCK_CONTACT_ROW } }],
      }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const result = await adapter.enrichLead({
      linkedinUrl: "https://www.linkedin.com/in/jane-example",
    });
    expect(firstRequestUrl(spy)).toContain("/api/v1/enrich/from-linkedin");
    expect(result.matched).toBe(true);
  });

  it("enrichLead with no match reports matched=false and 0 credits", async () => {
    mockFetchQueue([
      jsonResponse({ results: [{ success: false, data: null }] }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const result = await adapter.enrichLead({ email: "nobody@example.com" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("searchContacts posts filters + columns and maps rows", async () => {
    mockFetchQueue([
      jsonResponse({
        contacts: [MOCK_CONTACT_ROW],
        returned: 1,
        has_more: true,
        next_offset: 1,
      }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const page = await adapter.searchContacts(
      { domains: ["example.com"], requireEmail: true },
      { limit: 10 }
    );
    expect(page.leads).toHaveLength(1);
    expect(page.leads[0].email).toBe("jane@example.com");
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(1);
  });

  it("searchCompanies maps storage-named rows (co_name, org_domain)", async () => {
    mockFetchQueue([
      jsonResponse({
        companies: [
          {
            co_name: "HubSpot",
            org_domain: "hubspot.com",
            current_company_linkedin_url: "https://www.linkedin.com/company/hubspot",
            co_website: "https://www.hubspot.com",
            current_company_industry: "Software",
            employee_count_range: "5001-10000",
            company_hq_country: "United States",
            company_hq_city: "Cambridge",
          },
        ],
        returned: 1,
      }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const companies = await adapter.searchCompanies({ domains: ["hubspot.com"] });
    expect(companies).toHaveLength(1);
    expect(companies[0].fields.company?.value).toBe("HubSpot");
    expect(companies[0].fields.company_domain?.value).toBe("hubspot.com");
    expect(companies[0].fields.company_linkedin_url?.value).toContain("hubspot");
    expect(companies[0].matched).toBe(true);
  });

  it("lookupCompany returns unmatched when the lookup misses", async () => {
    mockFetchQueue([
      jsonResponse({ found: false, company: null, query_credits_used: 0 }),
    ]);
    const adapter = createGetLeadsAdapter({ apiKey: "key_test" });
    const result = await adapter.lookupCompany({ domain: "nope.example" });
    expect(result.matched).toBe(false);
    expect(result.creditsUsed).toBe(0);
  });

  it("records usage on a matched enrichment", async () => {
    mockFetchQueue([
      jsonResponse({
        results: [{ success: true, data: { ...MOCK_CONTACT_ROW } }],
      }),
    ]);
    const usage = createUsageSpy();
    const adapter = createGetLeadsAdapter({
      apiKey: "key_test",
      recordUsage: usage.recorder,
    });
    await adapter.enrichLead({ email: "jane@example.com" });
    expect(usage.calls).toHaveLength(1);
    expect(usage.calls[0].creditsUsed).toBe(1);
  });

  it("maps a 401 to provider_auth_failed", async () => {
    mockFetchQueue([jsonResponse({ error: "unauthorized" }, 401)]);
    const adapter = createGetLeadsAdapter({ apiKey: "bad-key" });
    await expect(
      adapter.enrichLead({ email: "jane@example.com" })
    ).rejects.toMatchObject({ code: "provider_auth_failed" });
  });

  it("throws when no API key is supplied", () => {
    expect(() => createGetLeadsAdapter({ apiKey: "" })).toThrow();
  });
});
