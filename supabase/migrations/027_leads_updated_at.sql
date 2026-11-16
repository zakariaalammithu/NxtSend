-- ============================================================================
-- Migration 027 — leads.updated_at (powers lead.updated + polling)
-- ============================================================================
-- Why: the `leads` table has no updated_at — only created_at — so
-- the Zapier `lead.updated` trigger and the `updated_at_desc`
-- polling order had nothing to order or compare on. This migration
-- adds the column, backfills it from created_at, and keeps it
-- current with a BEFORE UPDATE trigger.
--
-- Non-destructive: the column is nullable in DDL with a NOW()
-- default (new inserts are never null; the backfill covers older
-- rows), and the trigger only writes updated_at. No existing data
-- is changed apart from the backfill value itself.
--
-- Trigger safety: the trigger sets NEW.updated_at unconditionally
-- on every UPDATE, so a caller-supplied updated_at can never stick
-- (the Supabase leads repository also strips it from patches).
-- Idempotent: CREATE OR REPLACE for the function, DROP TRIGGER IF
-- EXISTS before CREATE TRIGGER.
-- ============================================================================

ALTER TABLE IF EXISTS leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE leads
  SET updated_at = created_at
  WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leads_updated_at();
