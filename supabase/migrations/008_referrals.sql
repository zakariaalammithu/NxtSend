-- ============================================================================
-- Migration 008 — Referrals: who brought whom (attribution only)
-- ============================================================================
-- Why: the Referral dashboard page needs a REAL substrate — a record
-- created when a new account signs up through someone's referral link
-- (/signup?ref=<user id>). This migration adds exactly that record:
--
--   * `referrals` — one row per referred signup. `status` is
--     'signed_up' when the referred account exists (the only status
--     the capture flow writes today) — no reward state is modelled,
--     because NO referral reward rules have been defined by the
--     product owner. Do not add reward columns until the rules exist;
--     the UI states rewards are not configured.
--
-- RLS: a user may read the referrals THEY made (referrer_id =
-- auth.uid()) and may insert the row that records THEIR OWN signup
-- (referred_user_id = auth.uid()). Nobody can read another user's
-- referral list, and nobody can fabricate a referral for someone
-- else's account. The capture endpoint (POST /api/referrals/record)
-- additionally validates the referrer exists and is not the caller.
--
-- STATUS: written and review-verified in Round-2 Stage E. Like
-- migrations 002–007 it has NOT been applied to any live Supabase
-- project from this environment; apply it in the SQL Editor after
-- 007 and re-test.
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  referred_email   TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'signed_up'
                     CHECK (status IN ('signed_up', 'pending')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One recorded referral per referred account: capture retries are
-- idempotent instead of creating duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_unique
  ON referrals (referred_user_id)
  WHERE referred_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON referrals (referrer_id, created_at DESC);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals: referrer reads own" ON referrals;
CREATE POLICY "referrals: referrer reads own"
  ON referrals FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid());

DROP POLICY IF EXISTS "referrals: referred user records own signup" ON referrals;
CREATE POLICY "referrals: referred user records own signup"
  ON referrals FOR INSERT
  TO authenticated
  WITH CHECK (referred_user_id = auth.uid());

-- No client UPDATE/DELETE policies: referral records are append-only
-- attribution facts.
