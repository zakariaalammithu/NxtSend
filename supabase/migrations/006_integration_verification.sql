-- ============================================================================
-- NxtSend Migration 006 — Integration Center: last-verification records
-- Apply AFTER 005_inbox.sql (Supabase SQL Editor, in order).
-- This migration is review-verified only; it has NOT been applied to any
-- live Supabase project from the build environment.
--
-- Why: the Integration Center's Test Connection actions perform a real,
-- read-only verification call per provider (Resend domain list, Stripe
-- account retrieve, OpenAI/Anthropic/Meta model lists, Supabase Auth
-- health, a signed webhook test event). The result is recorded on the
-- workspace's `integrations` row so the hub can honestly distinguish
-- "Connected and Verified" (a stored success + config still present)
-- from "Connected but Not Verified" (config present, never verified).
-- Without these columns a verification result would live only in the
-- browser session and the distinction would be lost on reload.
--
-- Columns (all nullable — NULL means "never verified"):
--   last_verified_at          timestamp of the last verification attempt
--   last_verification_status  'verified' | 'failed'
--   last_verification_message human-readable outcome (NEVER contains
--                             secret material — the API writes only the
--                             provider-facing message it returns)
--
-- Writes happen exclusively through the service role from
-- POST /api/integrations/[id]/verify (workspace owner/admin gated at
-- the API). No new RLS policies are needed: migration 002 already
-- restricts base-table access on `integrations` to workspace
-- owners/admins, regular members read status via the redacted
-- `integrations_status` view (which intentionally does not expose
-- these columns), and the service role bypasses RLS.
-- ============================================================================

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verification_status TEXT,
  ADD COLUMN IF NOT EXISTS last_verification_message TEXT;

ALTER TABLE integrations
  DROP CONSTRAINT IF EXISTS integrations_last_verification_status_check;

ALTER TABLE integrations
  ADD CONSTRAINT integrations_last_verification_status_check
  CHECK (
    last_verification_status IS NULL
    OR last_verification_status IN ('verified', 'failed')
  );
