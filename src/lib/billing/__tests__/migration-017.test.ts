import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/017_billing_webhook_failures.sql"),
  "utf8"
);

describe("migration 017 — billing webhook failure log schema shape", () => {
  it("creates the failures table with the contract columns", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS billing_webhook_failures");
    for (const column of [
      "event_id",
      "event_type",
      "error_summary",
      "received_at",
      "resolved",
      "resolved_at",
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/resolved\s+BOOLEAN\s+NOT NULL DEFAULT FALSE/);
    expect(sql).toMatch(/received_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });

  it("enables RLS with ZERO client policies (service-role only, house posture)", () => {
    expect(sql).toContain(
      "ALTER TABLE billing_webhook_failures ENABLE ROW LEVEL SECURITY"
    );
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/TO\s+(anon|authenticated|public)/i);
  });

  it("has NO unique constraint on event_id — one row per failed attempt is the point", () => {
    const tableSection = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS billing_webhook_failures"),
      sql.indexOf("ALTER TABLE billing_webhook_failures")
    );
    expect(tableSection).not.toMatch(/event_id\s+TEXT\s+NOT NULL UNIQUE/i);
    expect(tableSection).not.toContain("UNIQUE");
  });

  it("stores no payload/signature material — error summaries only", () => {
    const tableSection = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS billing_webhook_failures"),
      sql.indexOf("ALTER TABLE billing_webhook_failures")
    );
    expect(tableSection).not.toMatch(/payload/i);
    expect(tableSection).not.toMatch(/signature/i);
  });

  it("indexes for the admin view (recent first) and per-event resolution", () => {
    expect(sql).toContain("idx_billing_webhook_failures_received");
    expect(sql).toContain("idx_billing_webhook_failures_event");
  });
});
