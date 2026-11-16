-- ============================================================================
-- Migration 024 — RFC 8707 `resource` (audience) binding for OAuth tokens
-- ============================================================================
-- Why: the ChatGPT connector platform sends a `resource` parameter
-- (RFC 8707) naming the MCP resource it wants a token for, and
-- tokens must be bound to that resource — a token issued for
-- /api/mcp/chatgpt must not validate for /api/mcp, and vice versa.
-- This migration adds a nullable `resource` TEXT column to the two
-- tables from migration 023:
--
--   * `muse_oauth_codes.resource` — the resource the authorization
--     code was issued for (full MCP resource URL).
--   * `muse_oauth_tokens.resource` — the audience the token is
--     bound to (full MCP resource URL).
--
-- Nullable on purpose: rows issued before this migration (and
-- rows written by a deployment that has not applied it yet) carry
-- NULL, and the server treats those exactly like legacy tokens —
-- bound to the canonical Muse resource (/api/mcp). The Supabase
-- store (src/lib/muse-connector/oauth/store.ts) retries an insert
-- without the column when the column does not exist yet, so
-- issuance keeps working before this migration is applied.
--
-- No new tables: the migration-023 tables are client-agnostic
-- (client_id identifies the client) and are reused for ChatGPT.
-- RLS stays as migration 023 defined it (enabled, zero policies,
-- service-role only).
-- ============================================================================

ALTER TABLE IF EXISTS muse_oauth_codes
  ADD COLUMN IF NOT EXISTS resource TEXT;

ALTER TABLE IF EXISTS muse_oauth_tokens
  ADD COLUMN IF NOT EXISTS resource TEXT;

CREATE INDEX IF NOT EXISTS idx_muse_oauth_tokens_resource
  ON muse_oauth_tokens (resource);
