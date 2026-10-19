-- ============================================================================
-- Migration 009 — Per-user preferences (profile bio + notification toggles)
-- ============================================================================
-- Why: the user Settings page's profile/notification forms persisted
-- nothing at all (Round-2 audit §3.1). full_name can live on the
-- `profiles` row (migration 002 already grants users UPDATE on
-- full_name/avatar_url/updated_at for their own row), but the
-- profile "bio/title" line and the notification preferences have no
-- column anywhere. This table stores them as one JSONB record per
-- user, following the normalize-on-read core in
-- src/lib/user-settings/core.ts.
--
-- RLS: strictly own-row — a user can read, insert and update ONLY
-- the row whose user_id is their own id. Preferences are personal
-- data; workspace members and other users get nothing.
--
-- STATUS: written and review-verified in Round-2 Stage E. Like
-- migrations 002–008 it has NOT been applied to any live Supabase
-- project from this environment; apply it in the SQL Editor after
-- 008 and re-test.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  preferences JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences: read own" ON user_preferences;
CREATE POLICY "user_preferences: read own"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences: insert own" ON user_preferences;
CREATE POLICY "user_preferences: insert own"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences: update own" ON user_preferences;
CREATE POLICY "user_preferences: update own"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No client DELETE policy: preferences reset by upserting defaults.
