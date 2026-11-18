/**
 * HubSpot adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHubSpotAdapter, hubspotContactToLead, leadToHubSpotProperties } from "../adapter";
import {
  jsonResponse,
  errorResponse,
  mockFetch,
  fetchCalls,
  setTestEncryptionKey,
  restoreEncryptionKey,
  seedTestDeps,
} from "../../__tests__/helpers";

const CRED = { accessToken: "hs_test_token" };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

function searchResult(email: string, id = "123") {
  return {
    results: [
      {
        id,
        properties: {
          email,
          firstname: "Ada",
          lastname: "Lovelace",
          company: "Analytical Engines",
          jobtitle: "Mathematician",
        },
      },
    ],
  };
}

describe("hubspot mapping", () => {
  it("maps a HubSpot contact to a CrmLead", () => {
    const lead = hubspotContactToLead(searchResult("ada@example.com").results[0]);
    expect(lead).toMatchObject({
      externalId: "123",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
      jobTitle: "Mathematician",
    });
  });

  it("maps a lead to HubSpot properties with lifecyclestage", () => {
    const props = leadToHubSpotProperties({
      email: "ada@example.com",
      firstName: "Ada",
      status: "converted",
    });
    expect(props).toEqual({
      email: "ada@example.com",
      firstname: "Ada",
      lifecyclestage: "customer",
    });
  });
});

describe("hubspot testConnection", () => {
  it("returns ok on a 200 from account-info", async () => {
    mockFetch(() => jsonResponse({ portalId: 42 }));
    const result = await createHubSpotAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("42");
  });

  it("returns not-ok on 401 without retrying", async () => {
    const spy = mockFetch(() => errorResponse(401, { message: "unauthorized" }));
    const result = await createHubSpotAdapter().testConnection(CRED);
    expect(result.ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("throws when no access token is stored", async () => {
    await expect(createHubSpotAdapter().testConnection({})).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("hubspot import/export", () => {
  it("imports contacts across pages", async () => {
    mockFetch((url) => {
      if (url.includes("/crm/v3/objects/contacts")) {
        return jsonResponse({
          results: [searchResult("ada@example.com").results[0]],
          paging: { next: { after: "abc" } },
        });
      }
      return errorResponse(404);
    });
    const adapter = createHubSpotAdapter();
    const leads = await adapter.importContacts(CRED, { limit: 1 });
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("updates an existing contact by email on export", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/search")) return jsonResponse(searchResult("ada@example.com"));
      if (init.method === "PATCH") return jsonResponse({});
      return errorResponse(404);
    });
    const result = await createHubSpotAdapter().exportLead(CRED, {
      email: "ada@example.com",
      firstName: "Ada",
    });
    expect(result).toEqual({ externalId: "123", created: false });
    expect(fetchCalls(spy).some(([, i]) => i.method === "PATCH")).toBe(true);
  });

  it("creates a contact when no match exists", async () => {
    mockFetch((url, init) => {
      if (url.includes("/search")) return jsonResponse({ results: [] });
      if (init.method === "POST") return jsonResponse({ id: "999", properties: {} });
      return errorResponse(404);
    });
    const result = await createHubSpotAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "999", created: true });
  });

  it("syncs a note with the note_to_contact association", async () => {
    const spy = mockFetch(() => jsonResponse({ id: "n1" }));
    await createHubSpotAdapter().syncNote!(CRED, "123", { body: "Called, left voicemail." });
    const [, init] = fetchCalls(spy)[0];
    const body = JSON.parse(String(init.body));
    expect(body.properties.hs_note_body).toBe("Called, left voicemail.");
    expect(body.associations[0].types[0].associationTypeId).toBe(202);
  });

  it("refuses tag sync honestly", async () => {
    await expect(
      createHubSpotAdapter().syncTags!(CRED, "123", ["vip"])
    ).rejects.toThrow(/no native tag field/);
  });
});

describe("hubspot runImport (job lifecycle + dedupe)", () => {
  it("creates unique leads, skips email duplicates, completes the job", async () => {
    mockFetch(() => jsonResponse({
      results: [
        searchResult("ada@example.com", "1").results[0],
        searchResult("ADA@example.com", "2").results[0],
        searchResult("grace@example.com", "3").results[0],
      ],
    }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("hubspot", "oauth2", CRED);
    const result = await createHubSpotAdapter().runImport(deps);
    expect(result.direction).toBe("import");
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(leadsRepo.leads).toHaveLength(2);
    const { listSyncJobs } = await import("../../../sync");
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "hubspot");
    expect(jobs[0].status).toBe("completed");
  });

  it("fails the job when no credential is stored", async () => {
    mockFetch(() => jsonResponse({ results: [] }));
    const { deps } = await seedTestDeps("hubspot", "oauth2", CRED);
    // Remove the credential by seeding a fresh workspace with none.
    const empty = { ...deps, workspaceId: "ws_empty" };
    const result = await createHubSpotAdapter().runImport(empty);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/No credential/);
  });
});
