import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/020_linkedin_warmup.sql"),
  "utf8"
);

describe("migration 020 — LinkedIn warm-up program schema shape", () => {
  it("creates NO new tables (the program is 1:1 with the account)", () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
  });

  it("adds the lifecycle columns to connected_accounts, idempotently", () => {
    for (const column of [
      "warmup_status",
      "warmup_preset",
      "warmup_schedule",
      "warmup_overrides",
      "warmup_started_at",
      "warmup_paused_at",
      "warmup_paused_ms",
      "warmup_graduated_at",
      "warmup_history",
    ]) {
      expect(sql).toContain(
        `ADD COLUMN IF NOT EXISTS ${column}`
      );
    }
    expect(sql).toMatch(/ALTER TABLE connected_accounts/);
  });

  it("constrains the lifecycle + preset vocabularies", () => {
    for (const status of ["not_started", "warming", "paused", "graduated"]) {
      expect(sql).toContain(`'${status}'`);
    }
    for (const preset of ["conservative", "balanced", "accelerated", "custom"]) {
      expect(sql).toContain(`'${preset}'`);
    }
    expect(sql).toMatch(/warmup_status TEXT NOT NULL DEFAULT 'not_started'/);
  });

  it("keeps the pause clock numeric and the history an append-only JSONB array", () => {
    expect(sql).toMatch(/warmup_paused_ms BIGINT NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/warmup_history JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("attributes executions to accounts (claim-time fill, SET NULL on delete)", () => {
    expect(sql).toMatch(/ALTER TABLE campaign_step_executions/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS account_id UUID\s+REFERENCES connected_accounts\(id\) ON DELETE SET NULL/
    );
    expect(sql).toContain("idx_step_executions_account_day");
    expect(sql).toMatch(/ON campaign_step_executions \(account_id, created_at DESC\)/);
  });

  it("changes no RLS policies and seeds no content in SQL", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/UPDATE connected_accounts/i);
  });
});
