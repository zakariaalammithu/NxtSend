-- ============================================================================
-- Migration 030 — Centralized integration engine (Stage 1)
-- ============================================================================
-- Why: the provider workers (CRM, email outreach, automation,
-- enrichment, verification, AI, communication, productivity,
-- developer) all need the same three things — a place to store a
-- workspace's connection to a provider (credentials encrypted,
-- never plaintext), a record of each import/export sync run, and a
-- usage ledger. This migration adds those three tables and nothing
-- else. No provider-specific tables, no seeded content.
--
--   * `integration_connections` — one row per (workspace, provider).
--     Credentials live ONLY in `encrypted_credentials`, as the
--     `v1.<iv>.<tag>.<ciphertext>` output of `encryptToken`
--     (AES-256-GCM, keyed by TOKEN_ENCRYPTION_KEY — see
--     src/lib/oauth/crypto.ts and
--     src/lib/integrations/providers/connections.ts). The column is
--     nullable: a row may exist in `configuration_required` /
--     `disconnected` state before any credential is supplied.
--   * `integration_sync_jobs` — one row per import/export run,
--     with processed/created/updated/skipped/failed counts and a
--     jsonb error list (see src/lib/integrations/providers/sync.ts).
--   * `integration_usage` — one row per billable provider event,
--     for the usage ledger (credits_used is provider-defined; 0
--     means "counted, no credits consumed").
--
-- RLS: enabled, ZERO policies — service-role only, same pattern as
-- migrations 023/025/028. No client (browser) access.
--
-- STATUS: written, not applied. Like migrations 023–029 it has NOT
-- been applied to any live Supabase project from this environment;
-- apply it in the SQL Editor and re-test.
-- ============================================================================

-- ── Provider connections ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_connections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID        NOT NULL,
  provider              TEXT        NOT NULL,
  auth_type             TEXT        NOT NULL,
  encrypted_credentials TEXT,
  status                TEXT        NOT NULL DEFAULT 'disconnected',
  last_sync_at          TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_integration_connections_workspace_provider
    UNIQUE (workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_provider
  ON integration_connections (workspace_id, provider);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

-- ── Sync jobs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_sync_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL,
  provider      TEXT        NOT NULL,
  direction     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  processed     INT         NOT NULL DEFAULT 0,
  created_count INT         NOT NULL DEFAULT 0,
  updated_count INT         NOT NULL DEFAULT 0,
  skipped_count INT         NOT NULL DEFAULT 0,
  failed_count  INT         NOT NULL DEFAULT 0,
  errors        JSONB       NOT NULL DEFAULT '[]',
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_workspace_provider
  ON integration_sync_jobs (workspace_id, provider);

ALTER TABLE integration_sync_jobs ENABLE ROW LEVEL SECURITY;

-- ── Usage ledger ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_usage (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL,
  provider     TEXT        NOT NULL,
  event        TEXT        NOT NULL,
  credits_used INT         NOT NULL DEFAULT 0,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_usage_workspace_provider_recorded
  ON integration_usage (workspace_id, provider, recorded_at);

ALTER TABLE integration_usage ENABLE ROW LEVEL SECURITY;
