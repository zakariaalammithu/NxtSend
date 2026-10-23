import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/018_submission_notifications.sql"),
  "utf8"
);

/**
 * Migration 018 — contact notification tracking shape (P10 Stage C).
 * Mirrors the migration-017 shape-test pattern: the SQL is pinned to
 * the contract src/lib/email/contact-notification.ts and
 * src/lib/admin/submissions-core.ts rely on.
 */
describe("migration 018 — submission notification columns", () => {
  it("adds all six notification columns idempotently", () => {
    for (const column of [
      "notification_status",
      "notification_provider_id",
      "notification_error",
      "notification_attempts",
      "notification_sent_at",
      "notification_recipient",
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(sql).toMatch(/notification_attempts\s+INTEGER NOT NULL DEFAULT 0/);
  });

  it("constrains notification_status to the closed vocabulary", () => {
    expect(sql).toContain("submissions_notification_status_check");
    for (const status of [
      "pending",
      "sent",
      "failed",
      "not_configured",
      "simulated",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    // NULL stays valid (not applicable / not attempted).
    expect(sql).toMatch(/notification_status IS NULL/);
  });

  it("adds NO client policies — submissions stays service-role only", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/TO\s+(anon|authenticated|public)/i);
  });

  it("indexes the admin triage filter (failed / not_configured)", () => {
    expect(sql).toContain("idx_submissions_notification_status");
    expect(sql).toMatch(/WHERE notification_status IN \('failed', 'not_configured'\)/);
  });
});
