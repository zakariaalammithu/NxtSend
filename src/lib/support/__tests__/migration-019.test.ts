import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/019_support_chat.sql"),
  "utf8"
);

const TABLES = [
  "support_conversations",
  "support_messages",
  "support_knowledge_categories",
  "support_knowledge",
  "support_saved_replies",
  "support_settings",
  "support_agents",
  "support_conversation_events",
];

describe("migration 019 — support chat schema shape", () => {
  it("creates all eight support tables", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("enables RLS with ZERO client policies on every table (house posture)", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/TO\s+(anon|authenticated|public)/i);
    // No Realtime publication in this migration — polling transport.
    expect(sql).not.toMatch(/ALTER PUBLICATION/i);
  });

  it("conversations require an owner identity path (user OR guest token hash)", () => {
    expect(sql).toContain("support_conversations_owner_identity");
    expect(sql).toMatch(/user_id IS NOT NULL OR guest_access_token_hash IS NOT NULL/);
    expect(sql).toMatch(/guest_access_token_hash TEXT\s+UNIQUE/);
  });

  it("messages carry the monotonic sequence cursor and idempotency index", () => {
    expect(sql).toMatch(/sequence_no\s+BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE/);
    expect(sql).toContain("idx_support_messages_client_idempotency");
    expect(sql).toMatch(/WHERE client_message_id IS NOT NULL/);
    expect(sql).toMatch(/kind\s+TEXT\s+NOT NULL DEFAULT 'message'/);
    expect(sql).toContain("'internal_note'");
  });

  it("knowledge carries the app-maintained indexing fields", () => {
    for (const column of ["search_text", "content_hash", "indexed_at", "keywords", "priority", "slug"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/status\s+TEXT\s+NOT NULL DEFAULT 'draft'/);
    expect(sql).toContain("idx_support_knowledge_answerable");
  });

  it("settings is a singleton and agents key on the profile", () => {
    expect(sql).toMatch(/id\s+TEXT PRIMARY KEY CHECK \(id = 'global'\)/);
    expect(sql).toMatch(/profile_id\s+UUID\s+PRIMARY KEY REFERENCES profiles\(id\) ON DELETE CASCADE/);
    expect(sql).toContain("'offline', 'available', 'busy'");
  });

  it("events are append-only product history with the full lifecycle vocabulary", () => {
    for (const eventType of [
      "created",
      "escalated",
      "assigned",
      "unassigned",
      "transferred",
      "status_changed",
      "mode_changed",
      "resolved",
      "reopened",
      "note_added",
    ]) {
      expect(sql).toContain(`'${eventType}'`);
    }
  });

  it("seeds NO content in SQL (seeding is the app layer's idempotent first-run path)", () => {
    expect(sql).not.toMatch(/INSERT INTO/i);
  });
});
