-- ============================================================================
-- Migration 028 — n8n API keys (nxtsend_api_keys)
-- ============================================================================
-- Why: the n8n REST API accepts, alongside OAuth 2.0 access tokens,
-- scoped API keys created in-app (Settings → Integrations → n8n).
-- A key is `nxt_live_` + 32 base64url chars; only its SHA-256 hash
-- is stored (see src/lib/integrations/n8n/api-keys.ts) — the value
-- is shown exactly once at creation and never again.
--
-- Scopes are `n8n.read` / `n8n.write` only (there is no `n8n.send`
-- tier). Keys are expirable (`expires_at`) and revocable
-- (`revoked_at`); `last_used_at` is stamped best-effort on each
-- successful use.
--
-- RLS: enabled, ZERO policies — service-role only, like the OAuth
-- tables (migrations 023/024). No client (browser) access.
--
-- STATUS: written and review-verified. Like migrations 023–027 it
-- has NOT been applied to any live Supabase project from this
-- environment; apply it in the SQL Editor and re-test.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nxtsend_api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL,
  name          TEXT        NOT NULL,
  key_hash      TEXT        NOT NULL UNIQUE,
  key_prefix    TEXT        NOT NULL,
  scopes        TEXT[]      NOT NULL DEFAULT '{"n8n.read"}'
                CHECK (scopes <@ ARRAY['n8n.read', 'n8n.write']),
  expires_at    TIMESTAMPTZ NULL,
  last_used_at  TIMESTAMPTZ NULL,
  revoked_at    TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nxtsend_api_keys_workspace
  ON nxtsend_api_keys (workspace_id);

CREATE INDEX IF NOT EXISTS idx_nxtsend_api_keys_hash
  ON nxtsend_api_keys (key_hash);

ALTER TABLE nxtsend_api_keys ENABLE ROW LEVEL SECURITY;
