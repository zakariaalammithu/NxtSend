import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const sql = readFileSync(
  path.join(appRoot, "supabase/migrations/016_integration_hub.sql"),
  "utf8"
);

const TABLES = [
  "hub_integrations",
  "hub_credentials",
  "hub_test_accounts",
  "hub_checklist_items",
  "hub_checklist_state",
  "hub_documents",
];

describe("migration 016 — Integration Hub schema shape", () => {
  it("creates all six hub tables", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("enables RLS on every hub table", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("creates ZERO client policies (service-role only, 007/014 posture)", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/TO\s+(anon|authenticated|public)/i);
  });

  it("has NO workspace dimension — the Hub is platform-global by design", () => {
    // No hub_* table carries a workspace_id column: records cannot be
    // scoped to, or shifted between, workspaces by any request input.
    // Access control is the platform admin gate alone (see hub-server
    // scoping pins + route gate matrix).
    expect(sql).not.toMatch(/workspace_id/i);
  });

  it("hub_credentials stores the value ONLY as ciphertext (value_enc)", () => {
    expect(sql).toContain("value_enc");
    // No plaintext value column of any common name (column DEFINITIONS —
    // the word "plaintext" itself appears in explanatory comments).
    expect(sql).not.toMatch(/\bvalue\s+TEXT/i);
    expect(sql).not.toMatch(/plaintext\s+TEXT/i);
    expect(sql).not.toMatch(/password_enc|secret_value/i);
    // The only value fragment column is the server-computed last4.
    expect(sql).toContain("value_last4");
  });

  it("pins the credential kind / environment / status vocabularies", () => {
    for (const kind of [
      "api_key",
      "client_secret",
      "oauth_client_id",
      "webhook_secret",
      "bearer_token",
      "password",
      "test_account_password",
      "other",
    ]) {
      expect(sql).toContain(`'${kind}'`);
    }
    for (const env of ["production", "staging", "test", "development"]) {
      expect(sql).toContain(`'${env}'`);
    }
    for (const status of [
      "configured",
      "needs_verification",
      "expired",
      "revoked",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("pins the integration workflow vocabulary, defaulting to draft", () => {
    for (const status of [
      "draft",
      "configuring",
      "ready_for_submission",
      "submitted",
      "in_review",
      "changes_requested",
      "approved",
      "live",
      "paused",
      "retired",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(/status\s+TEXT\s+NOT NULL DEFAULT 'draft'/);
  });

  it("test accounts hold NO password column — only a credential FK", () => {
    const accountsSection = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS hub_test_accounts"),
      sql.indexOf("ALTER TABLE hub_test_accounts")
    );
    expect(accountsSection).toContain(
      "password_credential_id   UUID        REFERENCES hub_credentials(id) ON DELETE SET NULL"
    );
    expect(accountsSection).not.toMatch(/password\s+TEXT/i);
  });

  it("disclosure stamps exist (last_revealed / last_copied)", () => {
    expect(sql).toContain("last_revealed_at");
    expect(sql).toContain("last_revealed_by");
    expect(sql).toContain("last_copied_at");
    expect(sql).toContain("last_copied_by");
  });

  it("seeds the Stage D BRR records with honest statuses and no credentials", () => {
    // The six BRR records (Stage D seed contract; mirrored from
    // seed-content.ts, which the seed-content tests pin to this SQL).
    for (const slug of [
      "brr-muse-connector",
      "brr-rest-api",
      "brr-oauth",
      "brr-mcp",
      "brr-zapier",
      "brr-webhooks",
    ]) {
      expect(sql).toContain(`'${slug}'`);
    }
    expect(sql).toContain("'in_review'");
    expect(sql).toContain("'configuring'");
    expect(sql).toContain("ON CONFLICT (slug) DO NOTHING");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    // Credentials and test accounts are NEVER seeded — shells are
    // display-level metadata definitions only.
    expect(sql).not.toMatch(/INSERT INTO hub_credentials/i);
    expect(sql).not.toMatch(/INSERT INTO hub_test_accounts/i);
    // Nothing in the seed claims a live/approved integration state.
    const seedSection = sql.slice(sql.indexOf("INSERT INTO hub_integrations"));
    expect(seedSection).not.toContain("'live'");
    expect(seedSection).not.toContain("'approved'");
  });

  it("enforces the slug grammar and the per-integration uniqueness rules", () => {
    expect(sql).toContain("^[a-z0-9][a-z0-9-]*$");
    expect(sql).toContain("UNIQUE (integration_id, label, environment)");
    expect(sql).toContain("UNIQUE (integration_id, item_id)");
  });
});
