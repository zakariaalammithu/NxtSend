/**
 * Migration 015 shape tests (P6 Stage C): the messages voice columns
 * and the private voice-notes bucket + workspace-scoped storage
 * policies must exist in the SQL exactly as the app code expects.
 * (Static shape checks, same style as the migration 013/014 tests —
 * the migration is applied by the owner at go-live, nowhere yet.)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/015_voice_notes.sql",
    import.meta.url
  ),
  "utf8"
);

describe("migration 015 — voice notes", () => {
  it("adds the four voice columns to messages", () => {
    expect(sql).toMatch(/ALTER TABLE messages[\s\S]*ADD COLUMN IF NOT EXISTS voice_note_path TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS voice_note_duration_sec INTEGER/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS voice_note_language TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS transcript TEXT/);
    // Duration can never be negative.
    expect(sql).toMatch(/voice_note_duration_sec >= 0/);
  });

  it("creates the voice-notes bucket as PRIVATE with the 10 MB cap", () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets/);
    expect(sql).toContain("'voice-notes'");
    expect(sql).toMatch(/'voice-notes',\s*'voice-notes',\s*false/);
    expect(sql).toContain("10485760");
    expect(sql).toContain("audio/webm");
  });

  it("scopes storage policies to the first path segment = a member workspace", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(sql).toContain(`"voice-notes: members can ${op}"`);
    }
    expect(sql).toMatch(/ON storage\.objects/);
    expect(sql).toContain("bucket_id = 'voice-notes'");
    expect(sql).toContain("(storage.foldername(name))[1]");
    expect(sql).toContain("workspace_members");
    expect(sql).toContain("auth.uid()");
  });
});
