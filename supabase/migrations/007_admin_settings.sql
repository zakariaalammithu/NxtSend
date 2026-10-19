-- ============================================================================
-- NxtSend Migration 007 — Admin platform: settings + public submissions
-- Apply AFTER 006_integration_verification.sql (Supabase SQL Editor, in
-- order). This migration is review-verified only; it has NOT been applied
-- to any live Supabase project from the build environment.
--
-- Why: Round-2 Stage D gives the admin console two pieces of real
-- substrate it never had:
--
-- 1. `admin_settings` — a single-row platform settings record (site
--    name, support email, demo-banner toggle, signup open/closed flag,
--    global campaign sending defaults). The previous /admin/settings
--    page kept everything in React state and "saved" into the void; the
--    settings API (GET/PUT /api/admin/settings, admin-gated) now persists
--    here, and every change writes an audit_logs entry. `signups_open`
--    is enforced by the signup page via GET /api/settings/public.
--
-- 2. `submissions` — enquiries from the public marketing contact form
--    (source 'contact') and the demo booking-request form (source
--    'demo'). Those forms previously console.log'd and discarded every
--    submission. POST /api/submissions (public, validated +
--    rate-limited at the API) inserts here via the service role; admins
--    read/triage them in Admin → Submissions.
--
-- Access model for BOTH tables: RLS is enabled with NO client policies.
-- All reads/writes go through API routes using the service role after
-- server-side authorization (requireAdminApi for admin surfaces; the
-- public submissions route validates + rate-limits before inserting).
-- Direct PostgREST access from browsers is denied by default — that is
-- deliberate: a permissive public INSERT policy would let anyone bypass
-- the API's validation and rate limiting.
-- ============================================================================

-- ── Platform settings (singleton row, id = 'global') ────────────────────────

CREATE TABLE IF NOT EXISTS admin_settings (
  id                          TEXT        PRIMARY KEY DEFAULT 'global',
  site_name                   TEXT        NOT NULL DEFAULT 'NxtSend',
  support_email               TEXT        NOT NULL DEFAULT 'support@nxtsend.com',
  demo_banner_enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  signups_open                BOOLEAN     NOT NULL DEFAULT TRUE,
  default_daily_connections   INTEGER     NOT NULL DEFAULT 20,
  default_daily_messages      INTEGER     NOT NULL DEFAULT 50,
  updated_by                  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_settings (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only (see header).

-- ── Public submissions (contact + demo enquiries) ───────────────────────────

CREATE TABLE IF NOT EXISTS submissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT        NOT NULL CHECK (source IN ('contact', 'demo')),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  company     TEXT,
  subject     TEXT,
  message     TEXT        NOT NULL,
  meta        JSONB       NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'unread'
              CHECK (status IN ('unread', 'read')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_created
  ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status
  ON submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_source
  ON submissions (source, created_at DESC);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only (see header).

-- ── Notes for the operator ──────────────────────────────────────────────────
-- * Demo Mode never touches these tables: the API layer serves the same
--   shapes from labelled in-process demo stores (see
--   src/lib/admin/demo-server-store.ts), so a demo deployment cannot
--   accidentally write demo enquiries into a production database.
-- * Deleting a submission is intentionally not exposed in the admin UI;
--   triage is read/unread only in this stage.
