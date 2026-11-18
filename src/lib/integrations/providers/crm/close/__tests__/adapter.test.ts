/**
 * Close adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCloseAdapter, closeLeadToLeads, leadToCloseLead } from "../adapter";
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

const CRED = { apiKey: "close_test_key" };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const LEAD = {
  id: "lead_abc123",
  name: "Analytical Engines",
  contacts: [
    {
      id: "cont_1",
      lead_id: "lead_abc123",
      name: "Ada Lovelace",
      title: "Mathematician",
      emails: [{ email: "ada@example.com" }],
    },
  ],
};

describe("close mapping", () => {
  it("maps a lead's nested contacts to CrmLeads", () => {
    const leads = closeLeadToLeads(LEAD);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      externalId: "lead_abc123",
      email: "ada@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
    });
  });

  it("maps a lead to a Close lead with a nested contact", () => {
    const body = leadToCloseLead({
      email: "a@b.co",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Acme",
    });
    expect(body).toMatchObject({
      name: "Acme",
      contacts: [{ name: "Ada Lovelace", emails: [{ email: "a@b.co" }] }],
    });
  });
});

describe("close adapter", () => {
  it("testConnection uses Basic auth with the API key", async () => {
    const spy = mockFetch(() => jsonResponse({ first_name: "Ada", last_name: "Lovelace" }));
    const result = await createCloseAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    const headers = fetchCalls(spy)[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("close_test_key:").toString("base64")}`
    );
  });

  it("returns not-ok on 401", async () => {
    mockFetch(() => errorResponse(401, { error: "unauthorized" }));
    const result = await createCloseAdapter().testConnection(CRED);
    expect(result.ok).toBe(false);
  });

  it("imports leads across pages", async () => {
    mockFetch(() => jsonResponse({ data: [LEAD], total_results: 1 }));
    const leads = await createCloseAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("updates the lead when a nested contact email matches", async () => {
    const spy = mockFetch((url, init) => {
      if (url.includes("/lead/") && init.method === "GET")
        return jsonResponse({ data: [LEAD], total_results: 1 });
      if (init.method === "PUT") return jsonResponse({ ...LEAD });
      return errorResponse(404);
    });
    const result = await createCloseAdapter().exportLead(CRED, {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(result).toEqual({ externalId: "lead_abc123", created: false });
    expect(fetchCalls(spy).some(([, i]) => i.method === "PUT")).toBe(true);
  });

  it("creates a note activity on the lead", async () => {
    const spy = mockFetch(() => jsonResponse({ id: "act_1" }));
    await createCloseAdapter().syncNote!(CRED, "lead_abc123", { body: "Sent proposal." });
    const [url, init] = fetchCalls(spy)[0];
    expect(url).toContain("/activity/note/");
    expect(JSON.parse(String(init.body))).toMatchObject({
      lead_id: "lead_abc123",
      note: "Sent proposal.",
    });
  });

  it("syncs status by looking up the status label first", async () => {
    const spy = mockFetch((url) => {
      if (url.includes("/lead_status/"))
        return jsonResponse({ data: [{ id: "stat_1", label: "Potential" }] });
      return jsonResponse({ ...LEAD, status_id: "stat_1" });
    });
    await createCloseAdapter().syncLeadStatus!(CRED, "lead_abc123", "Potential");
    const put = fetchCalls(spy).find(([, i]) => i.method === "PUT");
    expect(put).toBeDefined();
    expect(JSON.parse(String(put![1].body))).toEqual({ status_id: "stat_1" });
  });

  it("runExport creates one lead and completes the job", async () => {
    mockFetch((url, init) => {
      if (url.includes("/lead/") && init.method === "GET")
        return jsonResponse({ data: [], total_results: 0 });
      if (init.method === "POST") return jsonResponse({ ...LEAD, id: "lead_new" });
      return errorResponse(404);
    });
    const { deps, syncJobStore } = await seedTestDeps("close", "api_key", CRED);
    const result = await createCloseAdapter().runExport(deps, [
      { email: "new@example.com", firstName: "New" },
    ]);
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "close");
    expect(jobs[0].status).toBe("completed");
  });
});
