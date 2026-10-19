-- ============================================================================
-- NxtSend Migration 003 — Campaign activity log
-- Run AFTER 001_initial_schema.sql and 002_security_hardening.sql.
--
-- Why: campaign lifecycle actions (create / pause / resume / archive /
-- duplicate / delete) need a durable, workspace-scoped activity trail.
-- audit_logs is intentionally service-role-only for inserts (migration 002,
-- finding F6), so client-driven campaign activity gets its own table
-- instead of reopening that hole.
--
-- Access model: workspace members can read their workspace's activity and
-- append entries for their own actions (actor_id must be themselves).
-- Entries are append-only from the client: no UPDATE/DELETE policies exist
-- for anon/authenticated, so history cannot be rewritten from the browser.
-- The `simulated` flag records whether the entry was produced by a
-- simulated/demo executor (always FALSE for real lifecycle actions).
--
-- STATUS: written and review-verified in Stage 2b. Like migration 002 it
-- has NOT been applied to any live Supabase project from this environment;
-- apply it in the SQL Editor after 002 and re-test with two tenants.
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_activity (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id  UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  details      TEXT        NOT NULL DEFAULT '',
  simulated    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_activity_workspace
  ON campaign_activity (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_activity_campaign
  ON campaign_activity (campaign_id, created_at DESC);

ALTER TABLE campaign_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_activity: members read" ON campaign_activity;
CREATE POLICY "campaign_activity: members read"
  ON campaign_activity FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "campaign_activity: members append own" ON campaign_activity;
CREATE POLICY "campaign_activity: members append own"
  ON campaign_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND actor_id = auth.uid()
  );

-- No UPDATE or DELETE policies for anon/authenticated on purpose:
-- the activity trail is append-only from the client. service_role keeps
-- full access for server-side jobs and admin tooling.
