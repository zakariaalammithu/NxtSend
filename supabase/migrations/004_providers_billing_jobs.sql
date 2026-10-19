-- ============================================================================
-- NxtSend Migration 004 — Provider events, billing, webhooks, jobs, usage
-- Run AFTER 001_initial_schema.sql, 002_security_hardening.sql and
-- 003_campaign_activity.sql.
--
-- Why: Stage 2c adds the server-side provider layer (Resend email, Stripe
-- billing, outbound webhooks for n8n/Zapier, background jobs). Those flows
-- need durable tables for:
--   * linking outbound messages to provider message IDs (Resend webhooks
--     update delivery state by provider ID),
--   * the Stripe customer ID on subscriptions (001 only had the
--     subscription ID),
--   * idempotent webhook processing (an event ID is recorded before its
--     effects are applied; a redelivery of the same event is a no-op),
--   * an outbound-webhook delivery log with retry bookkeeping,
--   * a background-jobs table + execution log for Vercel Cron runs,
--   * monthly usage rollups used by plan-limit enforcement.
--
-- Access model:
--   * billing_events / email_events / jobs / job_runs are SYSTEM tables:
--     RLS is enabled and NO policies exist for anon/authenticated, so the
--     browser can neither read nor write them. Only the service role
--     (server routes / cron worker) touches them, exactly like audit_logs
--     inserts after migration 002 (F6).
--   * webhook_deliveries / usage_records are workspace data: members may
--     READ their own workspace's rows; all writes are service-role only
--     (dispatch and rollup happen server-side).
--
-- STATUS: written and review-verified in Stage 2c. Like migrations 002/003
-- it has NOT been applied to any live Supabase project from this
-- environment; apply it in the SQL Editor after 003 and re-test.
-- ============================================================================

-- ── Messages: provider linkage ──────────────────────────────────────────────
-- Resend (and future providers) return their own message ID at send time;
-- delivery/bounce webhooks reference that ID, not ours.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_provider_message
  ON messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ── Subscriptions: Stripe customer linkage ──────────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── Billing events (Stripe webhook idempotency) ─────────────────────────────
-- One row per processed Stripe event. The webhook handler inserts the
-- event ID FIRST (unique constraint = the dedupe); a duplicate insert
-- means "already processed" and the handler returns 200 without
-- re-applying effects (no duplicate plan changes / charges bookkeeping).
CREATE TABLE IF NOT EXISTS billing_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT        NOT NULL DEFAULT 'stripe',
  event_id     TEXT        NOT NULL UNIQUE,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only.

-- ── Email events (Resend webhook log + dedupe) ──────────────────────────────
-- Resend delivers webhooks through Svix; the svix-id header is the unique
-- delivery ID and doubles as the idempotency key.
CREATE TABLE IF NOT EXISTS email_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT        NOT NULL DEFAULT 'resend',
  provider_event_id   TEXT        NOT NULL UNIQUE,
  event_type          TEXT        NOT NULL,
  provider_message_id TEXT,
  payload             JSONB       NOT NULL DEFAULT '{}',
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only.

-- ── Outbound webhook deliveries (n8n / Zapier / generic) ────────────────────
-- The subscription itself (URL + signing secret + event filter) lives in
-- the `integrations` table as provider = 'webhooks', whose config JSONB is
-- restricted to workspace owners/admins by migration 002 (F8). This table
-- is only the delivery log.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  target_url    TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'delivered', 'failed', 'simulated')),
  attempts      INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 3,
  last_error    TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace
  ON webhook_deliveries (workspace_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_deliveries: members read" ON webhook_deliveries;
CREATE POLICY "webhook_deliveries: members read"
  ON webhook_deliveries FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));
-- No client INSERT/UPDATE/DELETE: dispatch + retry bookkeeping are
-- service-role server operations.

-- ── Background jobs ──────────────────────────────────────────────────────────
-- Filled by server code / SQL / future producers; drained by
-- POST /api/jobs/run (Vercel Cron). `idempotency_key` makes enqueueing
-- the same logical job twice a no-op, and the runner skips keys that have
-- already completed, so a repeated cron tick never double-executes.
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  idempotency_key TEXT        NOT NULL UNIQUE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts        INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 3,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_due
  ON jobs (status, run_after);

CREATE TABLE IF NOT EXISTS job_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status      TEXT        NOT NULL DEFAULT 'running'
              CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  message     TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job
  ON job_runs (job_id, started_at DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only.

-- ── Usage records (monthly rollups for plan-limit enforcement) ──────────────
-- Written by the `usage_rollup` job; read by billing/usage helpers.
CREATE TABLE IF NOT EXISTS usage_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric       TEXT        NOT NULL,
  period_start DATE        NOT NULL,
  quantity     INTEGER     NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, metric, period_start)
);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_records: members read" ON usage_records;
CREATE POLICY "usage_records: members read"
  ON usage_records FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));
-- No client writes: rollups are computed server-side by the jobs worker.
