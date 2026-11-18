/**
 * Zoho CRM adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createZohoAdapter, zohoLeadToLead, leadToZohoFields } from "../adapter";
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

const CRED = { accessToken: "zoho_test_token" };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const RECORD = {
  id: "440248000000123456",
  Email: "ada@example.com",
  First_Name: "Ada",
  Last_Name: "Lovelace",
  Company: "Analytical Engines",
  Designation: "Mathematician",
  Lead_Status: "New",
};

describe("zoho mapping", () => {
  it("maps a Lead record to a CrmLead", () => {
    expect(zohoLeadToLead(RECORD)).toMatchObject({
      externalId: "440248000000123456",
      email: "ada@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
    });
  });

  it("maps a lead to Zoho fields with a Company fallback", () => {
    const fields = leadToZohoFields({ email: "a@b.co", firstName: "Ada", status: "converted" });
    expect(fields).toMatchObject({
      Email: "a@b.co",
      First_Name: "Ada",
      Company: "Ada",
      Lead_Status: "Qualified",
    });
  });
});

describe("zoho adapter", () => {
  it("testConnection uses the Zoho-oauthtoken header", async () => {
    const spy = mockFetch(() => jsonResponse({ data: [RECORD] }));
    const result = await createZohoAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    const headers = fetchCalls(spy)[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Zoho-oauthtoken zoho_test_token");
  });

  it("imports leads", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD] }));
    const leads = await createZohoAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("creates a Lead when search finds nothing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/search")) return jsonResponse({ data: [] });
      if (init.method === "POST")
        return jsonResponse({
          data: [{ code: "SUCCESS", status: "success", details: { id: "440248000000999999" } }],
        });
      return errorResponse(404);
    });
    const result = await createZohoAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
      lastName: "Person",
      company: "Acme",
    });
    expect(result).toEqual({ externalId: "440248000000999999", created: true });
  });

  it("treats a Zoho error status as a failure even on HTTP 200", async () => {
    mockFetch((url, init) => {
      if (url.includes("/search")) return jsonResponse({ data: [] });
      if (init.method === "POST")
        return jsonResponse({
          data: [{ code: "INVALID_DATA", status: "error", message: "Email is invalid" }],
        });
      return errorResponse(404);
    });
    await expect(
      createZohoAdapter().exportLead(CRED, {
        email: "bad",
        firstName: "Bad",
        company: "Acme",
      })
    ).rejects.toThrow(/Email is invalid/);
  });

  it("syncs status via the Lead_Status picklist", async () => {
    const spy = mockFetch(() =>
      jsonResponse({ data: [{ code: "SUCCESS", status: "success" }] })
    );
    await createZohoAdapter().syncLeadStatus!(CRED, RECORD.id, "converted");
    const body = JSON.parse(String(fetchCalls(spy)[0][1].body));
    expect(body.data[0].Lead_Status).toBe("Qualified");
  });

  it("creates a note with Parent_Id + se_module", async () => {
    const spy = mockFetch(() =>
      jsonResponse({ data: [{ code: "SUCCESS", status: "success" }] })
    );
    await createZohoAdapter().syncNote!(CRED, RECORD.id, {
      title: "Call",
      body: "Left a voicemail.",
    });
    const body = JSON.parse(String(fetchCalls(spy)[0][1].body));
    expect(body.data[0]).toMatchObject({
      Parent_Id: RECORD.id,
      se_module: "Leads",
      Note_Content: "Left a voicemail.",
    });
  });

  it("runImport completes the job", async () => {
    mockFetch(() => jsonResponse({ data: [RECORD] }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("zoho", "oauth2", CRED);
    const result = await createZohoAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "zoho");
    expect(jobs[0].status).toBe("completed");
  });
});
