-- ============================================================================
-- Migration 020 — LinkedIn warm-up programs (per-account ramp system)
-- ============================================================================
-- Why: until now an account's "warm-up" was a bare boolean
-- (`warmup_enabled`, migration 011) plus a flat `daily_limits` JSONB —
-- a vocabulary, not a system: no lifecycle, no schedule, no start
-- date, no usage counting, and nothing enforced anything. This
-- migration turns it into a per-account warm-up PROGRAM:
--
--   * `warmup_status` — the lifecycle: not_started / warming /
--     paused / graduated. The executor's warm-up gate engages only
--     when `warmup_enabled = true` AND status = 'warming'.
--   * `warmup_preset` — which preset the program started from
--     (conservative / balanced / accelerated) or 'custom' after any
--     schedule edit. Informational: the schedule in force is the
--     column below, never re-derived from the preset name, so
--     programs survive preset redefinitions in code.
--   * `warmup_schedule` — the RESOLVED schedule in force:
--     { "phases": [ { "days": 4, "caps": { …WarmupLimits } }, … ] }.
--     Starting a preset snapshots the preset into this column.
--   * `warmup_overrides` — partial WarmupLimits: an owner pin for a
--     specific action (e.g. connections held at 10 whatever the phase
--     says). When present for an action it replaces the phase cap in
--     the effective-cap formula: min(daily_limit, override ?? phase).
--   * `warmup_started_at` / `warmup_paused_at` / `warmup_paused_ms` —
--     the program clock. Phase day counts ACTIVE time only:
--     (paused ? paused_at : now) − started_at − paused_ms, so
--     pausing freezes the ramp and multiple pauses compose.
--   * `warmup_graduated_at` — when the program completed (schedule
--     elapsed, lazily recorded by the gate/panel) or the owner marked
--     the account ready.
--   * `warmup_history` — append-only JSONB array of control events
--     { action, at, by, detail? } (started / paused / resumed /
--     restarted / schedule_edited / override_set / graduated /
--     marked_ready): the audit trail the Accounts panel renders.
--     Kept on the row (not audit_logs) because account management is
--     client-side through the accounts repository in both stores —
--     the history works identically in Supabase and Demo Mode.
--
-- `warmup_enabled` (011) stays the master opt-in: toggling it off
-- disengages the gate WITHOUT destroying the program; the stored
-- `daily_limits` remain the owner's ceiling at all times (the
-- effective cap is the LOWER of the daily limit and the phase cap —
-- the migration deliberately does NOT raise anyone's stored limits).
--
-- Email-channel rows simply never leave 'not_started'; readers
-- ignore these fields for channel='email'.
--
-- Account attribution for executions: `campaign_step_executions`
-- gains `account_id`, filled by the executor at claim time from the
-- campaign's sender account for the step's channel. Warm-up usage
-- counters derive from execution rows (the codebase's
-- derive-don't-store posture — cf. countEmailsThisMonth). Pre-020
-- rows carry NULL and never count: every program starts with this
-- build. (Deriving from the campaign's CURRENT sender instead would
-- be wrong historically — a campaign that changes sender would
-- rewrite the past.)
--
-- RLS: no policy changes. `connected_accounts` keeps its 011 member
-- policies (the new columns ride the same row access), and
-- `campaign_step_executions` keeps its 010 posture (members read;
-- writes are service-role only — the executor worker).
--
-- Seeding: NO content is seeded by SQL. Presets live in code
-- (src/lib/linkedin/warmup.ts) and are snapshotted into
-- `warmup_schedule` by the app layer when a program starts.
--
-- Like migrations 001–019 this file is applied by the owner at
-- go-live, in order after 019; nothing here has been run against a
-- live database. Until it is applied, live-mode account rows read
-- tolerantly as not_started programs (the app layer's row mapper
-- defaults every missing column) and the executor's warm-up store
-- methods resolve to null, leaving the gate inert.
-- ============================================================================

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (warmup_status IN ('not_started', 'warming', 'paused', 'graduated'));

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_preset TEXT
    CHECK (warmup_preset IN ('conservative', 'balanced', 'accelerated', 'custom'));

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_schedule JSONB;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_overrides JSONB;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMPTZ;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_paused_at TIMESTAMPTZ;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_paused_ms BIGINT NOT NULL DEFAULT 0;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_graduated_at TIMESTAMPTZ;

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS warmup_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Execution → account attribution ────────────────────────────────────────

ALTER TABLE campaign_step_executions
  ADD COLUMN IF NOT EXISTS account_id UUID
    REFERENCES connected_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_step_executions_account_day
  ON campaign_step_executions (account_id, created_at DESC);
