-- ============================================================================
-- NxtSend Migration 010 — Sequence executor substrate
-- Run AFTER 001–009 (in numeric order).
--
-- Why: Round-2 Stage F turns the `follow_up_due` job from an honest stub
-- into a real sequence executor (src/lib/executor). The executor advances
-- campaign enrollments step by step: email steps are sent through the
-- email adapter (suppression-checked, provider-confirmed), LinkedIn steps
-- are recorded as skipped (no authorized LinkedIn provider exists), and
-- stop rules (reply / bounce / complaint / unsubscribe) halt enrollments.
-- It needs two pieces of durable state the 001 schema does not have:
--
--   * campaign_enrollments.last_step_at — when the previous step was
--     executed. Step N becomes due at
--     COALESCE(last_step_at, enrolled_at) + step.delay_hours.
--     (updated_at cannot serve: lifecycle touches also bump it.)
--
--   * campaign_step_executions — one row per enrollment step ATTEMPT that
--     reached a terminal outcome (sent / simulated / skipped / stopped /
--     executed-wait). UNIQUE (enrollment_id, step_order) is the
--     at-most-once claim: the executor inserts the row BEFORE sending,
--     so two concurrent worker runs can never send the same step twice.
--     Transient failures (provider error, not-configured, over plan
--     limit) DELETE the claim row instead, leaving the step due for the
--     next scan — and are still recorded in campaign_activity.
--
-- Access model: executions are workspace data written by the server-side
-- worker. Members may READ their own workspace's rows (transparency in
-- the UI); all writes are service-role only, exactly like
-- webhook_deliveries / usage_records in migration 004.
--
-- STATUS: written and review-verified in Round-2 Stage F. Like 002–009
-- it has NOT been applied to any live Supabase project from this
-- environment; apply it in the SQL Editor after 009 and re-test. The
-- executor's Supabase store tolerates its absence by failing the scan
-- with a clear error (the job is marked failed, nothing is sent).
-- ============================================================================

-- ── Enrollment progress timestamp ────────────────────────────────────────────
ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS last_step_at TIMESTAMPTZ;

-- ── Step executions (at-most-once claim + attempt log) ──────────────────────
CREATE TABLE IF NOT EXISTS campaign_step_executions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id       UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  enrollment_id     UUID        NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_order        INTEGER     NOT NULL,
  step_type         TEXT        NOT NULL,
  channel           TEXT        NOT NULL CHECK (channel IN ('email', 'linkedin', 'none')),
  status            TEXT        NOT NULL CHECK (status IN (
                      'sending', 'sent', 'simulated', 'skipped',
                      'stopped', 'executed', 'failed'
                    )),
  detail            TEXT        NOT NULL DEFAULT '',
  message_id        UUID        REFERENCES messages(id) ON DELETE SET NULL,
  provider          TEXT,
  provider_message_id TEXT,
  idempotency_key   TEXT        NOT NULL,
  simulated         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_step_executions_workspace
  ON campaign_step_executions (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_step_executions_campaign
  ON campaign_step_executions (campaign_id, created_at DESC);

ALTER TABLE campaign_step_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "step_executions: members read" ON campaign_step_executions;
CREATE POLICY "step_executions: members read"
  ON campaign_step_executions FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));
-- No client INSERT/UPDATE/DELETE: the executor runs server-side with the
-- service role (cron worker / jobs route).
