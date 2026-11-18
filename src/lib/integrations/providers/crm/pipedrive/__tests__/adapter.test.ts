/**
 * Pipedrive adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createPipedriveAdapter,
  createPipedriveActivityNote,
  pipedrivePersonToLead,
  leadToPipedrivePerson,
} from "../adapter";
import {
  jsonResponse,
  errorResponse,
  mockFetch,
  fetchCalls,
  setTestEncryptionKey,
  restoreEncryptionKey,
  seedTestDeps,
} from "../../__tests__/helpers";
import { listSyncJobs } from "../../../sync";

const CRED = { accessToken: "pd_test_token" };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const PERSON = {
  id: 7,
  name: "Ada Lovelace",
  email: [{ value: "ada@example.com", primary: true }],
  org_id: { name: "Analytical Engines" },
};

describe("pipedrive mapping", () => {
  it("maps a person to a CrmLead", () => {
    expect(pipedrivePersonToLead(PERSON)).toMatchObject({
      externalId: "7",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
    });
  });

  it("maps a lead to a person body with a primary email", () => {
    expect(leadToPipedrivePerson({ email: "a@b.co", firstName: "Ada", lastName: "L" })).toEqual({
      name: "Ada L",
      email: [{ value: "a@b.co", primary: true }],
    });
  });
});

describe("pipedrive adapter", () => {
  it("testConnection unwraps the envelope", async () => {
    mockFetch(() => jsonResponse({ success: true, data: { name: "Ada" } }));
    const result = await createPipedriveAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("Ada");
  });

  it("treats success:false as an error", async () => {
    mockFetch(() => jsonResponse({ success: false, data: null, error: "bad token" }));
    const result = await createPipedriveAdapter().testConnection(CRED);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/bad token/);
  });

  it("imports persons and stops at the pagination flag", async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        data: [PERSON],
        additional_data: { pagination: { more_items_in_collection: false } },
      })
    );
    const leads = await createPipedriveAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
  });

  it("creates a person when search finds nothing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/persons/search"))
        return jsonResponse({ success: true, data: { items: [] } });
      if (init.method === "POST")
        return jsonResponse({ success: true, data: { ...PERSON, id: 8 } });
      return errorResponse(404);
    });
    const result = await createPipedriveAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "8", created: true });
  });

  it("creates a note attached to the person", async () => {
    const spy = mockFetch(() => jsonResponse({ success: true, data: { id: 1 } }));
    await createPipedriveAdapter().syncNote!(CRED, "7", { body: "Follow up Tuesday." });
    const [url, init] = fetchCalls(spy)[0];
    expect(url).toContain("/notes");
    expect(JSON.parse(String(init.body))).toMatchObject({ person_id: 7 });
  });

  it("creates an activity with the person as primary participant", async () => {
    const spy = mockFetch(() => jsonResponse({ success: true, data: { id: 2 } }));
    await createPipedriveActivityNote(CRED, "7", "Call", "Discussed pricing.");
    const body = JSON.parse(String(fetchCalls(spy)[0][1].body));
    expect(body.participants).toEqual([{ person_id: 7, primary: true }]);
    expect(body.type).toBe("note");
  });

  it("runImport dedupes and completes the job", async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        data: [PERSON, { ...PERSON, id: 9 }],
        additional_data: { pagination: { more_items_in_collection: false } },
      })
    );
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("pipedrive", "oauth2", CRED);
    const result = await createPipedriveAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "pipedrive");
    expect(jobs[0].status).toBe("completed");
  });
});
