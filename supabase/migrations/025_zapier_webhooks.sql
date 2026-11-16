-- ============================================================================
-- Migration 025 — Zapier webhook (REST Hook) subscriptions + delivery outbox
-- ============================================================================
-- Why: Zapier REST Hook triggers subscribe per Zap (bundle.targetUrl,
-- unique per activated Zap). NxtSend stores each subscription with a
-- per-subscription HMAC secret (generated server-side, never returned
-- after creation) and enqueues one delivery row per active
-- subscription when an event fires (outbox pattern — see
-- src/lib/integrations/zapier/outbox.ts).
--
-- Dedup note: the brief sketched `event_id UUID UNIQUE`. The unique
-- key here is composite — UNIQUE (event_id, subscription_id) —
-- because one event fans out to several subscriptions, and a bare
-- UNIQUE on event_id would make the second subscription
-- un-enqueueable. The envelope `id` is still the receiver-facing
-- stable dedup id.
--
-- RLS: enabled, ZERO policies — service-role only, like migration
-- 023. No client (browser) access to either table.
--
-- STATUS: written and review-verified. Like migrations 023/024 it
-- has NOT been applied to any live Supabase project from this
-- environment; apply it in the SQL Editor and re-test.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zapier_webhook_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL,
  event         TEXT        NOT NULL,
  target_url    TEXT        NOT NULL,
  secret        TEXT        NOT NULL,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zapier_subs_workspace_event
  ON zapier_webhook_subscriptions (workspace_id, event)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_zapier_subs_inactive_updated
  ON zapier_webhook_subscriptions (updated_at)
  WHERE active = FALSE;

CREATE TABLE IF NOT EXISTS zapier_webhook_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL,
  subscription_id UUID        NOT NULL REFERENCES zapier_webhook_subscriptions(id) ON DELETE CASCADE,
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event           TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  attempts        INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 3,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zapier_webhook_deliveries_event_subscription_unique
    UNIQUE (event_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_zapier_deliveries_due
  ON zapier_webhook_deliveries (status, next_retry_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_zapier_deliveries_event_id
  ON zapier_webhook_deliveries (event_id);

ALTER TABLE zapier_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapier_webhook_deliveries ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Do NOT add a client policy —
-- subscription secrets and delivery payloads must never be readable
-- from the browser.
