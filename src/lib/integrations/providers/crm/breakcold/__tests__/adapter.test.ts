/**
 * Breakcold adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createBreakcoldAdapter,
  breakcoldRecordToLead,
  leadToBreakcoldFields,
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

const CRED = { apiKey: "bc_test_key", extra: { workspaceId: "ws_bc123" } };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const RECORD = {
  id: "rec_bc123456",
  workspaceId: "ws_bc123",
  fields: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    job_title: "Mathematician",
  },
};

describe("breakcold mapping", () => {
  it("maps a person record to a CrmLead", () => {
    expect(breakcoldRecordToLead(RECORD)).toMatchObject({
      externalId: "rec_bc123456",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
      jobTitle: "Mathematician",
    });
  });

  it("maps a lead to record fields", () => {
    expect(
      leadToBreakcoldFields({ email: "a@b.co", firstName: "Ada", lastName: "L" })
    ).toEqual({ name: "Ada L", email: "a@b.co" });
  });
});

describe("breakcold adapter", () => {
  it("testConnection lists workspaces (free endpoint)", async () => {
    const spy = mockFetch(() =>
      jsonResponse({ data: [{ id: "ws_bc123", name: "Main" }], pagination: { cursor: null, hasMore: false } })
    );
    const result = await createBreakcoldAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("1 workspace");
    expect(fetchCalls(spy)[0][0]).toContain("/workspaces");
  });

  it("testConnection fails without a workspaceId on import", async () => {
    await expect(
      createBreakcoldAdapter().importContacts({ apiKey: "k" })
    ).rejects.toThrow(/workspaceId/);
  });

  it("imports person records for the workspace", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD], pagination: { cursor: null, hasMore: false } }));
    const leads = await createBreakcoldAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("creates a record with the person object slug", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/records?") || url.endsWith("/records")) {
        if (init.method === "GET")
          return jsonResponse({ data: [], pagination: { cursor: null, hasMore: false } });
      }
      if (init.method === "POST")
        return jsonResponse({ record: { ...RECORD, id: "rec_new123" } });
      return errorResponse(404);
    });
    const result = await createBreakcoldAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "rec_new123", created: true });
    const post = fetchCalls(spy).find(([, i]) => i.method === "POST");
    expect(JSON.parse(String(post![1].body)).objectTypeSlug).toBe("person");
  });

  it("creates a note on the record", async () => {
    const spy = mockFetch(() => jsonResponse({ note: { id: "note_1" } }));
    await createBreakcoldAdapter().syncNote!(CRED, "rec_bc123456", {
      title: "Call",
      body: "Interested in a demo.",
    });
    const [url, init] = fetchCalls(spy)[0];
    expect(url).toContain("/records/rec_bc123456/notes");
    expect(JSON.parse(String(init.body))).toMatchObject({ content: "Interested in a demo." });
  });

  it("refuses status sync as config-ready", async () => {
    await expect(
      createBreakcoldAdapter().syncLeadStatus!(CRED, "rec_bc123456", "converted")
    ).rejects.toThrow(/config-ready/);
  });

  it("runImport completes the job", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD], pagination: { cursor: null, hasMore: false } }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("breakcold", "api_key", CRED);
    const result = await createBreakcoldAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "breakcold");
    expect(jobs[0].status).toBe("completed");
  });
});
