-- ============================================================================
-- Migration 029 — n8n webhook platform discriminator
-- ============================================================================
-- Why: the n8n integration reuses the Zapier webhook outbox
-- (migration 025) instead of duplicating its tables. A `platform`
-- column on both tables discriminates which platform a
-- subscription / delivery belongs to, so subscription management,
-- target-URL validation and the retry workers can filter per
-- platform while event emission fans out to every platform's
-- active subscriptions.
--
-- Tables keep their `zapier_` names on purpose: renaming them
-- would break the live Zapier integration (its store, routes and
-- jobs all reference these table names). The platform column is
-- the discriminator — do NOT rename the tables.
--
-- Non-destructive, additive only: both columns default to
-- 'zapier', so every existing Zapier row keeps its meaning and no
-- data is rewritten. Deliveries inherit their platform from their
-- subscription at enqueue time; the denormalised column on the
-- deliveries table exists so the retry worker can filter by
-- platform without joining subscriptions.
--
-- STATUS: written, not applied. Apply in the Supabase SQL Editor
-- alongside Worker A's migrations 028 (n8n API keys / v1 API).
-- ============================================================================

ALTER TABLE zapier_webhook_subscriptions
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'zapier'
  CHECK (platform IN ('zapier', 'n8n'));

ALTER TABLE zapier_webhook_deliveries
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'zapier'
  CHECK (platform IN ('zapier', 'n8n'));

-- Per-platform fan-out / management lookup: active subscriptions
-- for one platform + workspace + event.
CREATE INDEX IF NOT EXISTS idx_zapier_subs_platform
  ON zapier_webhook_subscriptions (platform, workspace_id, event)
  WHERE active = TRUE;

-- Per-platform retry lookup: due deliveries for one platform.
CREATE INDEX IF NOT EXISTS idx_zapier_deliveries_platform_due
  ON zapier_webhook_deliveries (platform, status, next_retry_at)
  WHERE status = 'failed';
