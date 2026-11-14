import { describe, it, expect } from "vitest";
import type { Lead } from "@/types";
import {
  parseIcpDescription,
  matchesLead,
  filterLeads,
  suggestListName,
  type IcpFilters,
} from "@/lib/data/lead-finder";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    workspace_id: "ws_demo_001",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    company: "FinPulse",
    job_title: "Chief Financial Officer",
    status: "new",
    tags: ["Fintech", "High-Priority"],
    custom_fields: { location: "London, UK", team_size: "1000+" },
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseIcpDescription — CFO / fintech / London example", () => {
  it("extracts title, industry keyword, location and company size", () => {
    const { filters, hasCriteria } = parseIcpDescription(
      "CFOs at fintech companies with 500+ people in London"
    );
    expect(hasCriteria).toBe(true);
    expect(filters.jobTitles).toEqual(["CFO"]);
    expect(filters.keywords).toContain("fintech");
    expect(filters.tags).toContain("fintech");
    expect(filters.locations).toEqual(["London"]);
    expect(filters.minCompanySize).toBe(500);
  });

  it("matches a lead that satisfies every group", () => {
    const { filters } = parseIcpDescription(
      "CFOs at fintech companies with 500+ people in London"
    );
    expect(matchesLead(makeLead(), filters)).toBe(true);
  });

  it("rejects a lead that fails any one group", () => {
    const { filters } = parseIcpDescription(
      "CFOs at fintech companies with 500+ people in London"
    );
    // Wrong title.
    expect(matchesLead(makeLead({ job_title: "VP of Product" }), filters)).toBe(false);
    // Wrong location.
    expect(
      matchesLead(makeLead({ custom_fields: { location: "Berlin, DE", team_size: "1000+" } }), filters)
    ).toBe(false);
    // Too small.
    expect(
      matchesLead(makeLead({ custom_fields: { location: "London, UK", team_size: "15-50" } }), filters)
    ).toBe(false);
    // No team size recorded — size cannot be verified, so no match.
    expect(
      matchesLead(makeLead({ custom_fields: { location: "London, UK" } }), filters)
    ).toBe(false);
  });
});

describe("parseIcpDescription — empty text", () => {
  it("returns empty filters with hasCriteria false", () => {
    const { filters, hasCriteria } = parseIcpDescription("");
    expect(hasCriteria).toBe(false);
    expect(filters).toEqual({
      jobTitles: [],
      keywords: [],
      tags: [],
      statuses: [],
      locations: [],
      minCompanySize: null,
    });
  });

  it("whitespace-only text is also empty", () => {
    expect(parseIcpDescription("   \n  ").hasCriteria).toBe(false);
  });

  it("empty filters match nothing (never dumps the whole CRM)", () => {
    const { filters } = parseIcpDescription("");
    expect(matchesLead(makeLead(), filters)).toBe(false);
    expect(filterLeads([makeLead()], filters)).toEqual([]);
  });
});

describe("parseIcpDescription — case-insensitivity", () => {
  it("matches titles and industries regardless of case", () => {
    const { filters } = parseIcpDescription("cfos AT FINTECH COMPANIES in london");
    expect(filters.jobTitles).toEqual(["CFO"]);
    expect(filters.keywords).toContain("fintech");
  });

  it("matches lead fields regardless of case", () => {
    const { filters } = parseIcpDescription("CFOs at fintech companies");
    const lead = makeLead({
      job_title: "cfo",
      company: "FINPULSE",
      tags: ["FINTECH"],
    });
    expect(matchesLead(lead, filters)).toBe(true);
  });
});

describe("parseIcpDescription — multiple titles", () => {
  it("collects every recognised title", () => {
    const { filters } = parseIcpDescription(
      "CEOs and CTOs at SaaS companies"
    );
    expect(filters.jobTitles).toEqual(["CEO", "CTO"]);
    expect(filters.keywords).toContain("saas");
  });

  it("matches a lead holding any one of the titles", () => {
    const { filters } = parseIcpDescription("CEOs and CTOs at SaaS companies");
    expect(
      matchesLead(
        makeLead({ job_title: "Co-founder & CTO", company: "ScaleWave", tags: ["SaaS"] }),
        filters
      )
    ).toBe(true);
    expect(
      matchesLead(
        makeLead({ job_title: "Head of Sales", company: "ScaleWave", tags: ["SaaS"] }),
        filters
      )
    ).toBe(false);
  });
});

describe("parseIcpDescription — no match", () => {
  it("returns no criteria for unrecognised text", () => {
    const parsed = parseIcpDescription("astronauts who like purple socks on Mars");
    expect(parsed.hasCriteria).toBe(false);
    expect(parsed.filters.jobTitles).toEqual([]);
    expect(parsed.filters.keywords).toEqual([]);
    expect(parsed.filters.locations).toEqual([]);
    expect(parsed.filters.minCompanySize).toBeNull();
  });

  it("filterLeads returns no rows for unrecognised text", () => {
    const { filters } = parseIcpDescription("astronauts on Mars");
    expect(filterLeads([makeLead(), makeLead({ id: "lead_2" })], filters)).toEqual([]);
  });
});

describe("parseIcpDescription — statuses and size phrasing", () => {
  it("detects explicit status words", () => {
    const { filters } = parseIcpDescription("unresponsive fintech leads");
    expect(filters.statuses).toEqual(["unresponsive"]);
    expect(matchesLead(makeLead({ status: "unresponsive" }), filters)).toBe(true);
    expect(matchesLead(makeLead({ status: "new" }), filters)).toBe(false);
  });

  it("understands 'at least 200 employees'", () => {
    const { filters } = parseIcpDescription("founders at companies with at least 200 employees");
    expect(filters.jobTitles).toEqual(["Founder"]);
    expect(filters.minCompanySize).toBe(200);
  });
});

describe("filterLeads", () => {
  it("returns only the matching subset, in original order", () => {
    const filters: IcpFilters = {
      jobTitles: ["CFO"],
      keywords: [],
      tags: [],
      statuses: [],
      locations: [],
      minCompanySize: null,
    };
    const leads = [
      makeLead({ id: "a", job_title: "CFO" }),
      makeLead({ id: "b", job_title: "CMO" }),
      makeLead({ id: "c", job_title: "Chief Financial Officer" }),
    ];
    expect(filterLeads(leads, filters).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("suggestListName", () => {
  it("builds a name from titles and keywords", () => {
    const { filters } = parseIcpDescription(
      "CFOs at fintech companies with 500+ people in London"
    );
    expect(suggestListName("CFOs at fintech companies with 500+ people in London", filters)).toBe(
      "CFO Fintech"
    );
  });

  it("falls back to the description's first words", () => {
    const { filters } = parseIcpDescription("astronauts on Mars");
    expect(suggestListName("astronauts on Mars", filters)).toBe("astronauts on Mars");
  });

  it("falls back to a generic name for empty text", () => {
    const { filters } = parseIcpDescription("");
    expect(suggestListName("", filters)).toBe("Lead Finder list");
  });
});
