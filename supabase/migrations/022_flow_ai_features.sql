-- ============================================================================
-- Migration 022 — Flow-AI-inspired features: prompt snippets, scheduled
-- replies, workspace safety settings.
-- ============================================================================
-- Why: three small workspace-scoped tables behind the new features —
--
--   * `prompt_snippets` — the co-pilot snippet library: short reusable
--     reply texts (title / body / category) an owner writes once and
--     inserts into the Inbox composer. Managed from the AI
--     Personalization page; no separate settings page.
--   * `scheduled_replies` — inbox replies queued for a future time.
--     A cron/worker sends due rows through the existing sendInboxReply
--     path; status moves scheduled -> sent | simulated | failed, or
--     cancelled by the owner. `conversation_id` references
--     conversations(id) so a deleted conversation takes its queued
--     replies with it.
--   * `workspace_safety_settings` — one row per workspace (workspace_id
--     is the primary key): the auto-pilot safety limits the executor
--     enforces — daily connection cap, working-hours window, working
--     days (ISO weekday numbers: 1 = Monday … 7 = Sunday; default
--     Mon–Fri) and the ramp-up toggle. Defaults match the values the
--     executor previously hard-coded (cap 15, 09:00–18:00, Mon–Fri,
--     ramp-up on); a workspace with no row is treated identically by
--     the app layer, so this migration changes no behaviour on its own.
--
-- RLS: the standard workspace pattern (cf. migrations 002, 005, 019) —
-- workspace members may select/insert/update/delete rows scoped to
-- their workspace via is_workspace_member(workspace_id); writes from
-- the server (cron worker, executor) go through the service role and
-- are unaffected by RLS.
--
-- Seeding: NO content is seeded by SQL. Snippets start empty (the app
-- layer offers a couple of starter texts only as an explicit
-- in-product action, never as database rows), scheduled replies start
-- empty, and safety settings are created lazily by the app layer on
-- first read with the defaults above.
--
-- Like migrations 001–021 this file is applied by the owner at
-- go-live, in order after 021; nothing here has been run against a
-- live database. Until it is applied, live-mode readers must tolerate
-- the missing tables (the app layer falls back to demo/empty state
-- and the safety gate resolves to its built-in defaults).
-- ============================================================================

-- ── Prompt snippets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_snippets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  category     TEXT        NOT NULL DEFAULT 'general',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_snippets_workspace
  ON prompt_snippets (workspace_id, created_at DESC);

ALTER TABLE prompt_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_snippets: members can select" ON prompt_snippets
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "prompt_snippets: members can insert" ON prompt_snippets
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "prompt_snippets: members can update" ON prompt_snippets
  FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "prompt_snippets: members can delete" ON prompt_snippets
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Scheduled replies ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_replies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID        REFERENCES conversations(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'sent', 'simulated', 'failed', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_replies_due
  ON scheduled_replies (workspace_id, scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE scheduled_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_replies: members can select" ON scheduled_replies
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "scheduled_replies: members can insert" ON scheduled_replies
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "scheduled_replies: members can update" ON scheduled_replies
  FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "scheduled_replies: members can delete" ON scheduled_replies
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Workspace safety settings ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_safety_settings (
  workspace_id        UUID        PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  daily_connection_cap INT        NOT NULL DEFAULT 15
                                CHECK (daily_connection_cap BETWEEN 1 AND 100),
  working_hours_start TIME        NOT NULL DEFAULT '09:00',
  working_hours_end   TIME        NOT NULL DEFAULT '18:00',
  -- ISO weekday numbers, 1 = Monday … 7 = Sunday. Default Mon–Fri.
  working_days        INT[]       NOT NULL DEFAULT '{1,2,3,4,5}',
  ramp_up_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workspace_safety_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_settings: members can select" ON workspace_safety_settings
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "safety_settings: members can insert" ON workspace_safety_settings
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "safety_settings: members can update" ON workspace_safety_settings
  FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "safety_settings: members can delete" ON workspace_safety_settings
  FOR DELETE USING (is_workspace_member(workspace_id));
