/**
 * Shared CRM helpers tests — pure functions + the shared runners
 * driven by a stub adapter (mocked fetch not needed here).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  configReadyError,
  crmLeadToNewLeadInput,
  leadToCrmLead,
  runCrmExport,
  runCrmImport,
  splitName,
  type CrmAdapter,
} from "../shared";
import {
  setTestEncryptionKey,
  restoreEncryptionKey,
  seedTestDeps,
  createFakeLeadsRepo,
} from "./helpers";
import { listSyncJobs } from "../../sync";
import type { Lead } from "@/types";

beforeEach(() => setTestEncryptionKey());
afterEach(() => restoreEncryptionKey());

const stubAdapter: CrmAdapter = {
  provider: "stub",
  async testConnection() {
    return { ok: true, detail: "ok" };
  },
  async importContacts() {
    return [
      { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
      { email: "ADA@example.com", firstName: "Ada", lastName: "Duplicate" },
      { firstName: "No Email" },
    ];
  },
  async exportLead(_cred, lead) {
    return { externalId: `ext_${lead.email ?? "none"}`, created: true };
  },
  async runImport() {
    throw new Error("unused");
  },
  async runExport() {
    throw new Error("unused");
  },
};

describe("shared CRM helpers", () => {
  it("splits names", () => {
    expect(splitName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(splitName("Ada")).toEqual({ firstName: "Ada" });
    expect(splitName("  ")).toEqual({ firstName: "" });
  });

  it("maps a CrmLead to a repository create input", () => {
    expect(
      crmLeadToNewLeadInput({ email: "a@b.co", firstName: "Ada", tags: ["vip"] })
    ).toMatchObject({ first_name: "Ada", email: "a@b.co", tags: ["vip"] });
  });

  it("maps a stored lead back to a CrmLead", () => {
    const lead = leadToCrmLead({
      id: "1",
      workspace_id: "ws",
      first_name: "Ada",
      email: "a@b.co",
      status: "new",
      tags: [],
      custom_fields: {},
      created_at: "2026-01-01T00:00:00.000Z",
    } as Lead);
    expect(lead).toMatchObject({ email: "a@b.co", firstName: "Ada", status: "new" });
  });

  it("configReadyError carries the provider_not_configured code", () => {
    const err = configReadyError("stub", "widget sync", "the widget endpoint is unverified.");
    expect((err as unknown as { code: string }).code).toBe("provider_not_configured");
    expect(err.message).toMatch(/widget sync/);
    expect(err.message).toMatch(/No request was sent/);
  });
});

describe("shared runners", () => {
  it("runCrmImport dedupes by email and keeps email-less leads", async () => {
    const { deps, syncJobStore, leadsRepo } = await seedTestDeps("stub", "api_key", {
      apiKey: "k",
    });
    const result = await runCrmImport(stubAdapter, deps);
    expect(result.created).toBe(2); // ada + no-email
    expect(result.skipped).toBe(1); // ADA duplicate
    expect(leadsRepo.leads).toHaveLength(2);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "stub");
    expect(jobs[0].status).toBe("completed");
  });

  it("runCrmExport counts created leads", async () => {
    const { deps, syncJobStore } = await seedTestDeps("stub", "api_key", { apiKey: "k" });
    const result = await runCrmExport(stubAdapter, deps, [
      { email: "a@b.co", firstName: "Ada" },
      { email: "b@c.co", firstName: "Bob" },
    ]);
    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    const jobs = await listSyncJobs(syncJobStore, "ws_test", "stub");
    expect(jobs[0].status).toBe("completed");
  });

  it("runCrmImport fails the job when no credential is stored", async () => {
    const connectionStore = (await seedTestDeps("stub", "api_key", { apiKey: "k" }))
      .connectionStore;
    const deps = {
      workspaceId: "ws_no_cred",
      connectionStore,
      syncJobStore: (await seedTestDeps("stub", "api_key", { apiKey: "k" })).syncJobStore,
      leadsRepo: createFakeLeadsRepo(),
    };
    const result = await runCrmImport(stubAdapter, deps);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/No credential/);
  });
});
