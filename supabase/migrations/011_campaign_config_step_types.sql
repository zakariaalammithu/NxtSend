-- ============================================================================
-- NxtSend Migration 011 — Campaign config JSONB + new sequence step
-- types + connected accounts
-- Run AFTER 001–010 (in numeric order).
--
-- Why: P4 Stages 3–4 rebuild the campaign tooling Closely-style
-- (canvas sequence builder, templates, message editor drawer, real
-- connected-account model). Three pieces of substrate are needed
-- that 001–010 do not have:
--
--   * campaigns.config JSONB — the wizard collects a description, an
--     audience-source definition and warm-up limit defaults per
--     campaign (P4 Stage 2). The demo repository persists them on the
--     campaign record, but the Supabase schema had no home for them:
--     the Supabase campaigns repository accepted and dropped them.
--     They now live in this single JSONB column (keys: description,
--     audience_source, warmup_limits). rowToCampaign already reads them
--     back out of `config`; from this migration on the repository also
--     writes them, so live campaigns round-trip the wizard metadata.
--
--   * step_type enum += like_post / view_profile / endorse_skills —
--     Closely's canvas offers these LinkedIn touch steps. They are
--     LinkedIn-channel steps exactly like connection_request /
--     linkedin_message: the executor records them SKIPPED (no
--     authorized LinkedIn provider exists) — never sent, never
--     simulated as sent. The values are added here so live campaign
--     steps using them can be stored at all.
--
-- Condition branching needs NO schema change: a condition step keeps
-- its Yes/No branch step-lists inside the step's own config JSONB
-- (campaign_steps.config, present since 001). The executor does not
-- evaluate conditions — it records a condition step as elapsed, with a
-- detail stating conditions are not evaluated in this version
-- (unchanged semantics).
--
--   * connected_accounts (P4 Stage 4) — until now the product had NO
--     account model: `integrations` (001) is one provider-config row
--     per workspace, and the email identity was a single env pair.
--     Closely-style account selectors, per-account warm-up state and
--     daily limits, and the {my_*} sender variables all presume real
--     per-channel account records. This table is that model: one row
--     per sending identity (channel linkedin/email), carrying the
--     display name + handle, warm-up flag, daily limits JSONB and the
--     sender profile fields (first/last name, job title, company)
--     that fill {my_first_name} etc. in message templates. Campaigns
--     reference their sending accounts via two new nullable columns
--     (sender_account_id = LinkedIn, email_account_id = email);
--     ON DELETE SET NULL means deleting an account never breaks a
--     campaign — readers fall back to the workspace sending state.
--     Creating a row here does NOT connect anything: real accounts
--     appear when an approved LinkedIn integration / the email
--     integration connects them; the repository never invents one.
--
-- STATUS: written for P4 Stages 3–4. Like 002–010 it has NOT been
-- applied to any live Supabase project from this environment; apply
-- it in the SQL Editor after 010 and re-test. Until it is applied,
-- live-mode campaign create/update still works for the classic
-- columns, but the wizard metadata, the three new step types, the
-- connected_accounts table and the campaigns' account references
-- cannot persist live (the demo backend has no such limitation).
-- ============================================================================

-- ── Campaign wizard metadata ───────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── New LinkedIn step types ────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- older Postgres versions; Supabase's SQL Editor runs each file as a
-- single statement batch, and IF NOT EXISTS keeps this re-runnable.
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'like_post';
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'view_profile';
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'endorse_skills';

-- ── Connected accounts (P4 Stage 4) ────────────────────────────────────────
-- One row per sending identity in a workspace. `daily_limits` holds the
-- six Closely warm-up counters (connection_requests, messages,
-- profile_views, like_post, endorse_skills, find_email); readers merge
-- stored values over the documented defaults, so partial JSONB is safe.
-- The sender_* fields are the identity behind the {my_*} variables.
CREATE TABLE IF NOT EXISTS connected_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel           TEXT        NOT NULL CHECK (channel IN ('linkedin', 'email')),
  provider          TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  handle_or_email   TEXT        NOT NULL DEFAULT '',
  avatar_url        TEXT,
  status            TEXT        NOT NULL DEFAULT 'connected'
                      CHECK (status IN ('connected', 'demo', 'error', 'disconnected')),
  warmup_enabled    BOOLEAN     NOT NULL DEFAULT true,
  daily_limits      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  sender_first_name TEXT        NOT NULL DEFAULT '',
  sender_last_name  TEXT        NOT NULL DEFAULT '',
  sender_job_title  TEXT        NOT NULL DEFAULT '',
  sender_company    TEXT        NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_workspace
  ON connected_accounts(workspace_id);

ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts: members can select" ON connected_accounts
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "accounts: members can insert" ON connected_accounts
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "accounts: members can update" ON connected_accounts
  FOR UPDATE USING (is_workspace_member(workspace_id));

CREATE POLICY "accounts: members can delete" ON connected_accounts
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Campaign → account references ──────────────────────────────────────────
-- Nullable by design: a campaign may predate the account model, and
-- deleting an account must never break its campaigns (SET NULL —
-- readers fall back to the workspace's general sending state).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sender_account_id UUID
    REFERENCES connected_accounts(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS email_account_id UUID
    REFERENCES connected_accounts(id) ON DELETE SET NULL;
