/**
 * Shared email-outreach helper tests — pure functions only, no network.
 *
 * Covers: lead → contact mapping, LinkedIn URL ↔ email identity map,
 * dedupe + suppression qualification (fail-closed), config-ready
 * errors, auth header builders, and list-body reading.
 */

import { describe, it, expect } from "vitest";
import type { Lead } from "@/types";
import {
  authHeadersFor,
  authQueryParam,
  buildIdentityMap,
  configReadyError,
  findEmailByLinkedInUrl,
  isConfigReadyError,
  mapLeadToContact,
  qualifyLeads,
  readListBody,
} from "./common";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    workspace_id: "ws-1",
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
    company: "Analytical Engines Ltd",
    job_title: "CEO",
    status: "new",
    tags: [],
    custom_fields: {},
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapLeadToContact", () => {
  it("maps name, company, title and LinkedIn URL", () => {
    const contact = mapLeadToContact(lead());
    expect(contact.email).toBe("ada@example.com");
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBe("Lovelace");
    expect(contact.company).toBe("Analytical Engines Ltd");
    expect(contact.jobTitle).toBe("CEO");
    expect(contact.linkedinUrl).toBe("https://www.linkedin.com/in/ada-lovelace");
  });

  it("trims fields and tolerates missing optionals", () => {
    const contact = mapLeadToContact(
      lead({ email: "  spaced@example.com ", company: undefined, linkedin_url: undefined })
    );
    expect(contact.email).toBe("spaced@example.com");
    expect(contact.company).toBe("");
    expect(contact.linkedinUrl).toBe("");
  });
});

describe("identity map (LinkedIn URL ↔ email)", () => {
  it("maps a LinkedIn URL to its lead email, first occurrence wins", () => {
    const map = buildIdentityMap([
      lead(),
      lead({ id: "lead-2", email: "other@example.com" }),
    ]);
    expect(findEmailByLinkedInUrl(map, "https://www.linkedin.com/in/ada-lovelace")).toBe(
      "ada@example.com"
    );
    expect(findEmailByLinkedInUrl(map, "https://www.linkedin.com/in/unknown")).toBeNull();
  });

  it("skips leads missing either side of the identity", () => {
    const map = buildIdentityMap([
      lead({ linkedin_url: undefined }),
      lead({ id: "lead-3", email: undefined }),
    ]);
    expect(map.size).toBe(0);
  });
});

describe("qualifyLeads", () => {
  it("dedupes by email, drops no-email and suppressed leads", async () => {
    const leads = [
      lead(),
      lead({ id: "lead-2", email: "ADA@example.com" }), // duplicate (case-insensitive)
      lead({ id: "lead-3", email: "suppressed@example.com" }),
      lead({ id: "lead-4", email: "" }),
      lead({ id: "lead-5", email: "bob@example.com" }),
    ];
    const { result, checkErrors } = await qualifyLeads(
      leads,
      async (email) => email === "suppressed@example.com"
    );
    expect(checkErrors).toEqual([]);
    expect(result.qualified.map((l) => l.id)).toEqual(["lead-1", "lead-5"]);
    expect(result.duplicates.map((l) => l.id)).toEqual(["lead-2"]);
    expect(result.suppressed.map((l) => l.id)).toEqual(["lead-3"]);
    expect(result.noEmail.map((l) => l.id)).toEqual(["lead-4"]);
  });

  it("fails closed when the suppression check throws", async () => {
    const { result, checkErrors } = await qualifyLeads([lead()], async () => {
      throw new Error("suppression store unavailable");
    });
    expect(result.qualified).toEqual([]);
    expect(checkErrors).toHaveLength(1);
    expect(checkErrors[0]).toContain("fail closed");
  });
});

describe("configReadyError", () => {
  it("marks the error and is detectable", () => {
    const err = configReadyError("example", "sync replies", "no endpoint verified");
    expect(err.message).toContain("config-ready");
    expect(isConfigReadyError(err)).toBe(true);
    expect(isConfigReadyError(new Error("other"))).toBe(false);
  });
});

describe("auth headers", () => {
  it("builds Bearer, Basic, X-API-Key and query auth", () => {
    expect(authHeadersFor("bearer", { apiKey: "k" })).toEqual({ Authorization: "Bearer k" });
    expect(authHeadersFor("basic", { apiKey: "k" }).Authorization).toBe(
      `Basic ${Buffer.from(":k").toString("base64")}`
    );
    expect(authHeadersFor("x-api-key", { apiKey: "k" })).toEqual({ "X-API-Key": "k" });
    expect(authHeadersFor("api-key-query", { apiKey: "k" })).toEqual({});
    expect(authQueryParam("api-key-query", { apiKey: "k" })).toEqual({ api_key: "k" });
    expect(authQueryParam("bearer", { apiKey: "k" })).toEqual({});
  });
});

describe("readListBody", () => {
  it("reads arrays and data/items/campaigns wrappers", () => {
    expect(readListBody([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(readListBody({ data: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(readListBody({ items: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    expect(readListBody({ campaigns: [{ id: 4 }] })).toEqual([{ id: 4 }]);
    expect(readListBody({ nothing: true })).toEqual([]);
    expect(readListBody(null)).toEqual([]);
  });
});
