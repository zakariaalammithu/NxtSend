-- ============================================================================
-- Migration 013 — Connected-account provider identity + auth health (P5 Stage F)
-- ============================================================================
-- Why: migration 011's `connected_accounts` rows are records only — they
-- carry no provider-side identity and no authentication health. Once an
-- approved provider integration exists (LinkedIn partner API, mailbox
-- OAuth, …), each account needs:
--
--   * `provider_account_id` — the account's id AT the provider (the
--     handle the provider's API uses), distinct from the display
--     handle/email. Nullable: records created by hand or by the demo
--     seeds have none.
--   * `auth_status` — the last recorded authorization state of the
--     account AT the provider: ok / needs_reconnect / expired /
--     error / not_connected. This is a RECORDED state, written by the
--     provider integration when it connects, syncs, or is told the
--     authorization died — it is never a live claim. The UI renders it
--     as "last recorded" alongside `last_sync_at`.
--   * `last_sync_at` — when the provider integration last synced this
--     account (activity, health). NULL = never synced.
--   * `last_error` — the provider's last error text for this account,
--     verbatim, so a broken account explains itself. NULL = none.
--
-- The columns apply to BOTH channels: email accounts gain the same
-- health/reconnect model (a revoked mailbox grant is the same problem
-- as an expired LinkedIn authorization).
--
-- Backfill: rows whose record status is 'connected' were created by an
-- integration that believed the account authorized, so their recorded
-- auth state starts at 'ok'. Every other row keeps the default
-- 'not_connected' — the honest state for a record nothing has
-- authorized. No row gains a provider id or a sync time: those are
-- facts only a real provider sync can produce.
--
-- Like migrations 001–012 this file is applied by the owner at
-- go-live; nothing here has been run against a live database.
-- ============================================================================

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS auth_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (auth_status IN ('ok', 'needs_reconnect', 'expired', 'error', 'not_connected'));

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Backfill the recorded auth state for accounts an integration had
-- already marked connected (see header). Idempotent: re-running keeps
-- any more specific state a provider sync has since recorded.
UPDATE connected_accounts
SET auth_status = 'ok'
WHERE status = 'connected' AND auth_status = 'not_connected';
