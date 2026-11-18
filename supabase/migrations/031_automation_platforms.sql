-- ============================================================================
-- Migration 031 — widen the webhook platform discriminator
-- ============================================================================
-- Why: migration 029 added a `platform` column to
-- zapier_webhook_subscriptions / zapier_webhook_deliveries with a
-- CHECK constraining it to ('zapier', 'n8n'). The four new
-- automation platforms (Make, Pabbly Connect, Albato,
-- Activepieces) reuse the same outbox (their v1 webhook
-- subscribe/unsubscribe/subscriptions routes write
-- platform='make' | 'pabbly' | 'albato' | 'activepieces'), so the
-- CHECK must admit them or every subscribe call fails at insert
-- time with a constraint violation.
--
-- The 029 CHECKs are unnamed inline constraints, so Postgres gave
-- them generated names (e.g.
-- zapier_webhook_subscriptions_platform_check) — the DO block
-- below drops whatever CHECK mentions `platform IN` on either
-- table, then re-adds named constraints covering all six
-- platforms. Nothing else changes: the tables keep their
-- `zapier_` names, the defaults stay 'zapier', and no data is
-- rewritten.
--
-- Non-destructive, additive only. Apply AFTER migration 029
-- (which adds the platform columns); if 029 has not been applied
-- the DO blocks below no-op and the ADD CONSTRAINT steps are
-- skipped. The integration engine tables from migration 030
-- (integration_connections, integration_sync_jobs,
-- integration_usage) need no change: their `provider` column is
-- free TEXT with no CHECK.
--
-- STATUS: written, not applied. Apply in the Supabase SQL Editor
-- alongside migrations 023–030 and re-test.
-- ============================================================================

-- Drop the 029 CHECKs (whatever Postgres named them).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('zapier_webhook_subscriptions'::regclass, 'zapier_webhook_deliveries'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%platform IN%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

-- Re-add, named, covering all six REST platforms — only when the
-- platform column exists (i.e. migration 029 was applied).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zapier_webhook_subscriptions' AND column_name = 'platform'
  ) THEN
    ALTER TABLE zapier_webhook_subscriptions
      ADD CONSTRAINT zapier_subs_platform_check
      CHECK (platform IN ('zapier', 'n8n', 'make', 'pabbly', 'albato', 'activepieces'));
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zapier_webhook_deliveries' AND column_name = 'platform'
  ) THEN
    ALTER TABLE zapier_webhook_deliveries
      ADD CONSTRAINT zapier_deliveries_platform_check
      CHECK (platform IN ('zapier', 'n8n', 'make', 'pabbly', 'albato', 'activepieces'));
  END IF;
END $$;
