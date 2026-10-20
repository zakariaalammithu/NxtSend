-- ============================================================================
-- Migration 012 — In-app notifications (P5 Stage D)
-- ============================================================================
-- Why: until now the product had NO stored notification records. The
-- admin console derives its feed at read time (audit entries, failed
-- job runs, failed webhook deliveries), and the user dashboard's bell
-- rendered a hard-coded sample list — presentation, not data. P5
-- Stage D adds reply-arrival notifications: when inbound ingestion
-- files a reply into a conversation, the workspace must be told.
-- That needs a durable per-workspace record with read state, which is
-- what this table is.
--
--   * `notifications` — one row per notification. `user_id` NULL means
--     workspace-wide (every member sees it); a set `user_id` targets
--     one member. Ingestion creates workspace-wide reply
--     notifications (user_id NULL).
--   * Creation is a SYSTEM write: ingestion runs tenant-less through
--     the service role (which bypasses RLS), so there is deliberately
--     NO client INSERT policy. Members can only read and mark read.
--   * Read/mark-read go through the session client; the policies
--     scope rows to the caller's workspaces and hide rows targeted at
--     a different user.
--
-- Like migrations 001–011 this file is applied by the owner at
-- go-live; nothing here has been run against a live database.
-- ============================================================================

-- ── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL DEFAULT 'info',
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  link         TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_created
  ON notifications (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (workspace_id)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Members see workspace-wide rows plus rows targeted at themselves.
CREATE POLICY "notifications: members can select" ON notifications
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Members can update (mark read) exactly the rows they can see. The
-- WITH CHECK repeats the predicate so a row can never be re-targeted
-- to another workspace or user through an update.
CREATE POLICY "notifications: members can update" ON notifications
  FOR UPDATE USING (
    is_workspace_member(workspace_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  ) WITH CHECK (
    is_workspace_member(workspace_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- No INSERT / DELETE policies on purpose: creation is service-role
-- only (system events), and notifications expire by age in the UI
-- (lists are capped), not by member deletion.
