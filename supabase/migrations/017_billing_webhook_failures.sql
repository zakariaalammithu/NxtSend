-- ============================================================================
-- Migration 017 — Billing webhook failure log (P9 Stage B, item B4)
-- ============================================================================
-- Why: Stripe webhook processing is exactly-once by design (migration
-- 004): the handler records the event ID in `billing_events` BEFORE
-- applying its effects, and when applying throws it DELETES the record
-- and returns 500 so Stripe retries and the event is reprocessed.
-- That design is correct — but it means a failed event left no trace
-- anywhere an operator could see: no row in `billing_events`, nothing
-- in the admin UI, only a transient server log line.
--
-- `billing_webhook_failures` is the durable, admin-visible record of
-- those failures. It is deliberately a SEPARATE table, written
-- best-effort by the handler AFTER the idempotency record has been
-- rolled back, so it can never interfere with the exactly-once flow:
--   * one row per FAILED processing attempt (an event that fails
--     twice has two rows — the history of attempts is the point);
--   * `error_summary` is the thrown error's message, truncated by the
--     writer (max 500 chars). It never contains the event payload,
--     signatures, or any secret — those stay in `billing_events`
--     (verified payloads) and Stripe respectively;
--   * when a later redelivery of the same event processes
--     successfully, the handler marks the event's open rows
--     `resolved = TRUE` with `resolved_at` — rows are NEVER deleted,
--     so the failure history stays readable in Admin → Billing →
--     Transactions.
--
-- Access model: RLS ENABLED with ZERO client policies (the 004/007/
-- 014 posture for system tables). All reads/writes run through the
-- service role from gated server routes only (the webhook route and
-- `resolveAdminGate`-gated admin APIs); any anon/authenticated query
-- returns zero rows.
--
-- Like migrations 001–016 this file is applied by the owner at
-- go-live, in order after 016; nothing here has been run against a
-- live database. Until it is applied, the webhook handler treats the
-- failure log as unavailable and continues exactly as before (the
-- writes are best-effort by design).
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_webhook_failures (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  error_summary TEXT        NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_failures_received
  ON billing_webhook_failures (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_failures_event
  ON billing_webhook_failures (event_id);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_failures_open
  ON billing_webhook_failures (received_at DESC) WHERE resolved = FALSE;

ALTER TABLE billing_webhook_failures ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only.
