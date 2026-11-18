/**
 * Monday.com adapter tests — mocked fetch only, no real network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createMondayAdapter,
  mondayItemToLead,
  leadToMondayColumnValues,
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

const COLUMNS = { email: "email_col", company: "company_col", jobTitle: "title_col", status: "status_col" };
const CRED = {
  apiKey: "monday_test_token",
  extra: { boardId: "123456", columns: JSON.stringify(COLUMNS) },
};

beforeEach(() => setTestEncryptionKey());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEncryptionKey();
});

const ITEM = {
  id: "987654",
  name: "Ada Lovelace",
  column_values: [
    { id: "email_col", text: "ada@example.com", value: '{"email":"ada@example.com"}' },
    { id: "company_col", text: "Analytical Engines", value: '"Analytical Engines"' },
    { id: "title_col", text: "Mathematician", value: '"Mathematician"' },
    { id: "status_col", text: "New", value: '{"label":"New"}' },
  ],
};

function graphqlData(data: unknown) {
  return jsonResponse({ data });
}

describe("monday mapping", () => {
  it("maps a board item to a CrmLead via the column mapping", () => {
    expect(mondayItemToLead(ITEM, COLUMNS)).toMatchObject({
      externalId: "987654",
      email: "ada@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
      jobTitle: "Mathematician",
      status: "New",
    });
  });

  it("maps a lead to column values keyed by column id", () => {
    const values = leadToMondayColumnValues(
      { email: "a@b.co", firstName: "Ada", company: "Acme", status: "New" },
      COLUMNS
    );
    expect(values.email_col).toEqual({ email: "a@b.co", text: "a@b.co" });
    expect(values.company_col).toBe("Acme");
    expect(values.status_col).toEqual({ label: "New" });
  });
});

describe("monday adapter", () => {
  it("testConnection sends the raw token (no Bearer prefix) + API-Version", async () => {
    const spy = mockFetch(() => graphqlData({ me: { id: "1", name: "Ada" } }));
    const result = await createMondayAdapter().testConnection(CRED);
    expect(result.ok).toBe(true);
    const headers = fetchCalls(spy)[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("monday_test_token");
    expect(headers["API-Version"]).toBe("2024-10");
  });

  it("surfaces GraphQL errors as a failed test", async () => {
    mockFetch(() => jsonResponse({ errors: [{ message: "Invalid token" }] }));
    const result = await createMondayAdapter().testConnection(CRED);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/Invalid token/);
  });

  it("imports items from the board", async () => {
    mockFetch(() => graphqlData({ boards: [{ items_page: { items: [ITEM] } }] }));
    const leads = await createMondayAdapter().importContacts(CRED);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ada@example.com");
  });

  it("creates an item when no email match exists", async () => {
    mockFetch((url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.query.includes("items_page"))
        return graphqlData({ boards: [{ items_page: { items: [] } }] });
      if (body.query.includes("create_item"))
        return graphqlData({ create_item: { id: "111222" } });
      return errorResponse(400);
    });
    const result = await createMondayAdapter().exportLead(CRED, {
      email: "new@example.com",
      firstName: "New",
    });
    expect(result).toEqual({ externalId: "111222", created: true });
  });

  it("updates column values when the email matches an item", async () => {
    const spy = mockFetch((url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.query.includes("items_page"))
        return graphqlData({ boards: [{ items_page: { items: [ITEM] } }] });
      if (body.query.includes("change_multiple_column_values"))
        return graphqlData({ change_multiple_column_values: { id: "987654" } });
      return errorResponse(400);
    });
    const result = await createMondayAdapter().exportLead(CRED, {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(result).toEqual({ externalId: "987654", created: false });
    expect(
      fetchCalls(spy).some(([, i]) =>
        String(i.body).includes("change_multiple_column_values")
      )
    ).toBe(true);
  });

  it("syncs status via change_column_value", async () => {
    const spy = mockFetch(() => graphqlData({ change_column_value: { id: "987654" } }));
    await createMondayAdapter().syncLeadStatus!(CRED, "987654", "Converted");
    const body = JSON.parse(String(fetchCalls(spy)[0][1].body));
    expect(body.query).toContain("change_column_value");
    expect(body.variables.columnId).toBe("status_col");
  });

  it("refuses note sync as config-ready", async () => {
    await expect(
      createMondayAdapter().syncNote!(CRED, "987654", { body: "x" })
    ).rejects.toThrow(/config-ready/);
  });

  it("runImport completes the job", async () => {
    mockFetch(() => graphqlData({ boards: [{ items_page: { items: [ITEM] } }] }));
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("monday", "api_key", CRED);
    const result = await createMondayAdapter().runImport(deps);
    expect(result.created).toBe(1);
    expect(leadsRepo.leads).toHaveLength(1);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "monday");
    expect(jobs[0].status).toBe("completed");
  });
});
