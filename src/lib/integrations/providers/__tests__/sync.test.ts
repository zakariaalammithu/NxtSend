/**
 * Sync-job + lead-dedupe tests — in-memory store shim, no database.
 */

import { describe, it, expect } from "vitest";
import {
  createMemorySyncJobStore,
  createSyncJob,
  finishSyncJob,
  listSyncJobs,
  recordSyncError,
  dedupeLeadsByEmail,
} from "../sync";

const WS_A = "ws_a";
const WS_B = "ws_b";

describe("sync job lifecycle", () => {
  it("creates a pending job and finishes it completed", async () => {
    const store = createMemorySyncJobStore();
    const job = await createSyncJob(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      direction: "import",
    });
    expect(job.status).toBe("pending");
    expect(job.processed).toBe(0);
    expect(job.finishedAt).toBeNull();

    const finished = await finishSyncJob(store, job.id, {
      processed: 10,
      created: 7,
      updated: 2,
      skipped: 1,
      failed: 0,
      errors: [],
    });
    expect(finished?.status).toBe("completed");
    expect(finished).toMatchObject({
      processed: 10,
      created: 7,
      updated: 2,
      skipped: 1,
      failed: 0,
    });
    expect(finished?.errors).toEqual([]);
    expect(finished?.finishedAt).not.toBeNull();
  });

  it("finishes failed when anything failed or an error was recorded", async () => {
    const store = createMemorySyncJobStore();
    const job = await createSyncJob(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      direction: "export",
    });
    const finished = await finishSyncJob(store, job.id, {
      processed: 5,
      created: 4,
      updated: 0,
      skipped: 0,
      failed: 1,
      errors: ["row 3: bad email"],
    });
    expect(finished?.status).toBe("failed");
    expect(finished?.errors).toEqual(["row 3: bad email"]);
  });

  it("recordSyncError appends the error, bumps failed, and marks failed", async () => {
    const store = createMemorySyncJobStore();
    const job = await createSyncJob(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      direction: "import",
    });
    const updated = await recordSyncError(store, job.id, "provider 500 on page 2");
    expect(updated?.status).toBe("failed");
    expect(updated?.failed).toBe(1);
    expect(updated?.errors).toEqual(["provider 500 on page 2"]);

    const again = await recordSyncError(store, job.id, "second failure");
    expect(again?.failed).toBe(2);
    expect(again?.errors).toEqual(["provider 500 on page 2", "second failure"]);
  });

  it("recordSyncError returns null for an unknown job and never throws", async () => {
    const store = createMemorySyncJobStore();
    await expect(recordSyncError(store, "no-such-id", "boom")).resolves.toBeNull();
  });

  it("lists jobs per workspace, optionally filtered by provider", async () => {
    const store = createMemorySyncJobStore();
    await createSyncJob(store, { workspaceId: WS_A, provider: "hubspot", direction: "import" });
    await createSyncJob(store, { workspaceId: WS_A, provider: "salesforce", direction: "import" });
    await createSyncJob(store, { workspaceId: WS_B, provider: "hubspot", direction: "import" });

    expect(await listSyncJobs(store, WS_A)).toHaveLength(2);
    expect(await listSyncJobs(store, WS_A, "hubspot")).toHaveLength(1);
    expect(await listSyncJobs(store, WS_B)).toHaveLength(1);
    expect(await listSyncJobs(store, "ws_missing")).toHaveLength(0);
  });

  it("finishSyncJob returns null for an unknown job", async () => {
    const store = createMemorySyncJobStore();
    await expect(
      finishSyncJob(store, "no-such-id", {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      })
    ).resolves.toBeNull();
  });
});

describe("dedupeLeadsByEmail", () => {
  it("keeps the first occurrence and reports the rest as duplicates", () => {
    const { unique, duplicates } = dedupeLeadsByEmail([
      { email: "a@example.com", name: "First" },
      { email: "b@example.com", name: "Second" },
      { email: "a@example.com", name: "Dup of first" },
    ]);
    expect(unique.map((l) => l.name)).toEqual(["First", "Second"]);
    expect(duplicates.map((l) => l.name)).toEqual(["Dup of first"]);
  });

  it("normalises case and surrounding whitespace (same rule as the CRM)", () => {
    const { unique, duplicates } = dedupeLeadsByEmail([
      { email: "  Ada@Example.com " },
      { email: "ada@example.com" },
      { email: "ADA@EXAMPLE.COM" },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(2);
  });

  it("never dedupes rows with no email against each other", () => {
    const { unique, duplicates } = dedupeLeadsByEmail([
      { email: null },
      { email: "" },
      { email: undefined },
      { email: "x@example.com" },
    ]);
    expect(unique).toHaveLength(4);
    expect(duplicates).toHaveLength(0);
  });

  it("returns empty results for an empty list", () => {
    expect(dedupeLeadsByEmail([])).toEqual({ unique: [], duplicates: [] });
  });
});
