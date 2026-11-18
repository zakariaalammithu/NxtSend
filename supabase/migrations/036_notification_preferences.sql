/**
 * Notification preferences table (migration 036).
 *
 * Why a new table: notification preferences are per-workspace UI
 * settings (which alert types go to which channel). Migration 030's
 * `integration_connections` has no settings/JSONB column — storing
 * preferences there would mean abusing a credentials table for UI
 * settings, and `integration_sync_jobs` / `integration_usage` are
 * append-only run/usage ledgers. One small table is the honest
 * shape; no provider-specific columns live here (the channel list
 * is a JSONB array of the channel names in
 * src/lib/integrations/notifications/preferences.ts).
 *
 * RLS: enabled, ZERO policies — service-role only, same pattern as
 * migrations 023/025/028/030. No client (browser) access.
 *
 * STATUS: written, not applied. Apply it in the Supabase SQL Editor
 * and re-test, like migrations 023–030.
 */

CREATE TABLE IF NOT EXISTS integration_notification_preferences (
  workspace_id      UUID        PRIMARY KEY,
  enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
  channels          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  daily_report_hour INT         NOT NULL DEFAULT 9,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE integration_notification_preferences ENABLE ROW LEVEL SECURITY;
