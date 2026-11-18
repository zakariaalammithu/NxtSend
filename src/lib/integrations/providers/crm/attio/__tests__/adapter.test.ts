/**
 * Attio adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAttioAdapter, attioRecordToLead, leadToAttioValues } from "../adapter";
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

const CRED = { accessToken: "attio_test_token" };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const RECORD = {
  id: { record_id: "rec_abc123" },
  values: {
    name: [{ first_name: "Ada", last_name: "Lovelace", full_name: "Ada Lovelace" }],
    email_addresses: [{ email_address: "ada@example.com" }],
  },
};

describe("attio mapping", () => {
  it("maps a people record to a CrmLead", () => {
    expect(attioRecordToLead(RECORD)).toMatchObject({
      externalId: "rec_abc123",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("maps a lead to Attio values", () => {
    expect(leadToAttioValues({ email: "a@b.co", firstName: "Ada", lastName: "L" })).toEqual({
      name: [{ first_name: "Ada", last_name: "L", full_name: "Ada L" }],
      email_addresses: [{ email_address: "a@b.co" }],
    });
  });
});

describe("attio adapter", () => {
  it("testConnection hits /objects", async () => {
    const spy = mockFetch(() => jsonResponse({ data: [] }));
    const result = await createAttioAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    expect(fetchCalls(spy)[0][0]).toContain("/v2/objects");
  });

  it("imports people via the query endpoint", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD] }));
    const leads = await createAttioAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("asserts (upserts) by email when no record is found", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/query")) return jsonResponse({ data: [] });
      if (init.method === "POST")
        return jsonResponse({ data: { id: { record_id: "rec_new" }, values: {} } });
      return errorResponse(404);
    });
    const result = await createAttioAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "rec_new", created: true });
    expect(fetchCalls(spy).some(([u]) => u.includes("matching_attribute=email_addresses"))).toBe(
      true
    );
  });

  it("updates the record when the email query finds it", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/query")) return jsonResponse({ data: [RECORD] });
      if (init.method === "PATCH") return jsonResponse({ data: RECORD });
      return errorResponse(404);
    });
    const result = await createAttioAdapter().exportLead(CRED, {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(result).toEqual({ externalId: "rec_abc123", created: false });
    expect(fetchCalls(spy).some(([, i]) => i.method === "PATCH")).toBe(true);
  });

  it("creates a note with parent_object + parent_record_id", async () => {
    const spy = mockFetch(() => jsonResponse({ data: { id: { note_id: "n1" } } }));
    await createAttioAdapter().syncNote!(CRED, "rec_abc123", {
      title: "Call",
      body: "Discussed rollout.",
    });
    const body = JSON.parse(String(fetchCalls(spy)[0][1].body));
    expect(body.data).toMatchObject({
      parent_object: "people",
      parent_record_id: "rec_abc123",
      format: "plaintext",
    });
  });

  it("refuses status sync as config-ready", async () => {
    await expect(
      createAttioAdapter().syncLeadStatus!(CRED, "rec_abc123", "converted")
    ).rejects.toThrow(/config-ready/);
  });

  it("runImport completes the job", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD] }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("attio", "bearer_token", CRED);
    const result = await createAttioAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "attio");
    expect(jobs[0].status).toBe("completed");
  });
});
