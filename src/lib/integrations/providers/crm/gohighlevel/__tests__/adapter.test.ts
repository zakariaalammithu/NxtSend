/**
 * GoHighLevel adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createGoHighLevelAdapter,
  ghlContactToLead,
  leadToGhlContact,
  ghlStatusTag,
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

const CRED = { accessToken: "ghl_test_token", extra: { locationId: "loc_123" } };

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const CONTACT = {
  id: "contact_1",
  locationId: "loc_123",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  companyName: "Analytical Engines",
  tags: ["inbound"],
};

describe("gohighlevel mapping", () => {
  it("maps a contact to a CrmLead", () => {
    expect(ghlContactToLead(CONTACT)).toMatchObject({
      externalId: "contact_1",
      email: "ada@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
      tags: ["inbound"],
    });
  });

  it("maps a lead to a contact body with locationId", () => {
    expect(
      leadToGhlContact({ email: "a@b.co", firstName: "Ada" }, "loc_123")
    ).toEqual({ locationId: "loc_123", firstName: "Ada", email: "a@b.co" });
  });

  it("builds a namespaced status tag", () => {
    expect(ghlStatusTag("converted")).toBe("nxtsend:converted");
  });
});

describe("gohighlevel adapter", () => {
  it("testConnection sends the Version header", async () => {
    const spy = mockFetch(() => jsonResponse({ contacts: [], total: 0 }));
    const result = await createGoHighLevelAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    const headers = fetchCalls(spy)[0][1].headers as Record<string, string>;
    expect(headers.Version).toBe("2021-07-28");
    expect(headers.Authorization).toBe("Bearer ghl_test_token");
  });

  it("testConnection fails without a locationId", async () => {
    const result = await createGoHighLevelAdapter().testConnection({
      accessToken: "tok",
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/locationId/);
  });

  it("imports contacts for the location", async () => {
    mockFetch(() => jsonResponse({ contacts: [CONTACT], total: 1 }));
    const leads = await createGoHighLevelAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("creates a contact when search finds nothing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/contacts/search")) return jsonResponse({ contacts: [] });
      if (init.method === "POST")
        return jsonResponse({ contact: { ...CONTACT, id: "contact_2" } });
      return errorResponse(404);
    });
    const result = await createGoHighLevelAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "contact_2", created: true });
  });

  it("syncs status by replacing the nxtsend: tag", async () => {
    const spy = mockFetch((url, init) => {
      if (init.method === "GET") return jsonResponse(CONTACT);
      if (init.method === "PUT") return jsonResponse({ contact: CONTACT });
      return errorResponse(404);
    });
    await createGoHighLevelAdapter().syncLeadStatus!(CRED, "contact_1", "converted");
    const put = fetchCalls(spy).find(([, i]) => i.method === "PUT");
    const body = JSON.parse(String(put![1].body));
    expect(body.tags).toContain("nxtsend:converted");
    expect(body.tags).toContain("inbound");
  });

  it("refuses note sync as config-ready (path unverified)", async () => {
    await expect(
      createGoHighLevelAdapter().syncNote!(CRED, "contact_1", { body: "x" })
    ).rejects.toThrow(/config-ready/);
  });

  it("retries a 429 once then succeeds", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return calls === 1
        ? errorResponse(429, { message: "slow down" })
        : jsonResponse({ contacts: [CONTACT], total: 1 });
    });
    const leads = await createGoHighLevelAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("runImport completes the job", async () => {
    mockFetch(() => jsonResponse({ contacts: [CONTACT], total: 1 }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps(
      "gohighlevel",
      "bearer_token",
      CRED
    );
    const result = await createGoHighLevelAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "gohighlevel");
    expect(jobs[0].status).toBe("completed");
  });
});
