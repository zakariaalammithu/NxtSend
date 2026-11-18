/**
 * Salesforce adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSalesforceAdapter,
  salesforceContactToLead,
  leadToSalesforceFields,
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

const CRED = {
  accessToken: "sf_test_token",
  extra: { instanceUrl: "https://acme.my.salesforce.com" },
};

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const CONTACT = {
  Id: "003xx000004TmiQAAS",
  FirstName: "Ada",
  LastName: "Lovelace",
  Email: "ada@example.com",
  Title: "Mathematician",
  Account: { Name: "Analytical Engines" },
};

describe("salesforce mapping", () => {
  it("maps a Contact to a CrmLead", () => {
    expect(salesforceContactToLead(CONTACT)).toMatchObject({
      externalId: "003xx000004TmiQAAS",
      email: "ada@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
    });
  });

  it("maps a lead to Contact fields", () => {
    expect(
      leadToSalesforceFields({ email: "a@b.co", firstName: "Ada", lastName: "Lovelace" })
    ).toEqual({ FirstName: "Ada", LastName: "Lovelace", Email: "a@b.co" });
  });
});

describe("salesforce adapter", () => {
  it("testConnection succeeds on /limits and uses the instance URL", async () => {
    const spy = mockFetch(() => jsonResponse({ DailyApiRequests: { Max: 100000 } }));
    const result = await createSalesforceAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    expect(fetchCalls(spy)[0][0]).toContain("acme.my.salesforce.com/services/data/v64.0/limits");
  });

  it("testConnection fails without an instanceUrl", async () => {
    const result = await createSalesforceAdapter().testConnection({
      accessToken: "tok",
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/instanceUrl/);
  });

  it("imports contacts via SOQL", async () => {
    mockFetch(() => jsonResponse({ records: [CONTACT], done: true }));
    const leads = await createSalesforceAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("creates a Contact when the SOQL lookup finds nothing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/query")) return jsonResponse({ records: [], done: true });
      if (init.method === "POST") return jsonResponse({ id: "003new", success: true });
      return errorResponse(404);
    });
    const result = await createSalesforceAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
      lastName: "Person",
    });
    expect(result).toEqual({ externalId: "003new", created: true });
  });

  it("updates the Contact when the SOQL lookup finds it", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/query")) return jsonResponse({ records: [CONTACT], done: true });
      if (init.method === "PATCH") return jsonResponse({});
      return errorResponse(404);
    });
    const result = await createSalesforceAdapter().exportLead(CRED, {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(result).toEqual({ externalId: CONTACT.Id, created: false });
    expect(fetchCalls(spy).some(([, i]) => i.method === "PATCH")).toBe(true);
  });

  it("logs activity as a Task with WhoId", async () => {
    const spy = mockFetch(() => jsonResponse({ id: "00Txx" }));
    await createSalesforceAdapter().syncNote!(CRED, CONTACT.Id, { body: "Demo booked." });
    const [, init] = fetchCalls(spy)[0];
    const body = JSON.parse(String(init.body));
    expect(body.WhoId).toBe(CONTACT.Id);
    expect(body.Status).toBe("Completed");
  });

  it("refuses status sync as config-ready (no status field on Contact)", async () => {
    await expect(
      createSalesforceAdapter().syncLeadStatus!(CRED, CONTACT.Id, "converted")
    ).rejects.toThrow(/provider_not_configured|no status field/);
  });

  it("runImport creates leads and completes the job", async () => {
    mockFetch(() => jsonResponse({ records: [CONTACT], done: true }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("salesforce", "oauth2", CRED);
    const result = await createSalesforceAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "salesforce");
    expect(jobs[0].status).toBe("completed");
  });
});
