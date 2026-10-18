-- ============================================================================
-- NxtSend Database Migrations
-- Run these in your Supabase SQL Editor in order.
-- ============================================================================

-- ── Enable extensions ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM types ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('free', 'starter', 'growth', 'agency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_type AS ENUM ('linkedin', 'email', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE step_type AS ENUM ('connection_request', 'linkedin_message', 'email', 'wait', 'condition');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('pending', 'active', 'completed', 'stopped', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_channel AS ENUM ('linkedin', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('outbound', 'inbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error', 'demo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email       TEXT        UNIQUE NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        user_role   NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'user'  -- NEVER auto-assign admin here
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  plan        plan_type   NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Workspace Members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('owner','admin','member')) DEFAULT 'member',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Auto-add owner as member on workspace create
CREATE OR REPLACE FUNCTION add_workspace_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created ON workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION add_workspace_owner();

-- ── Campaigns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID            NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT            NOT NULL,
  type         campaign_type   NOT NULL DEFAULT 'linkedin',
  status       campaign_status NOT NULL DEFAULT 'draft',
  created_by   UUID            REFERENCES profiles(id),
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── Campaign Steps ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_steps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_order   INTEGER     NOT NULL DEFAULT 0,
  step_type    step_type   NOT NULL,
  delay_hours  INTEGER     NOT NULL DEFAULT 0,
  subject      TEXT,
  content      TEXT,
  config       JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  linkedin_url  TEXT,
  company       TEXT,
  job_title     TEXT,
  status        TEXT        NOT NULL DEFAULT 'new',
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  custom_fields JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate leads within a workspace by email
CREATE UNIQUE INDEX IF NOT EXISTS leads_workspace_email_unique
  ON leads (workspace_id, email)
  WHERE email IS NOT NULL AND email != '';

-- ── Campaign Enrollments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID              NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id      UUID              NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status       enrollment_status NOT NULL DEFAULT 'pending',
  current_step INTEGER           NOT NULL DEFAULT 0,
  enrolled_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, lead_id)
);

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID               NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id      UUID               REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id  UUID               REFERENCES campaigns(id) ON DELETE SET NULL,
  channel      message_channel    NOT NULL,
  direction    message_direction  NOT NULL,
  subject      TEXT,
  content      TEXT               NOT NULL DEFAULT '',
  status       TEXT               NOT NULL DEFAULT 'sent',
  is_demo      BOOLEAN            NOT NULL DEFAULT FALSE,
  sent_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- ── Integrations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID               NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider     TEXT               NOT NULL,
  status       integration_status NOT NULL DEFAULT 'demo',
  config       JSONB              NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider)
);

-- ── Subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  plan                   plan_type   NOT NULL DEFAULT 'free',
  status                 TEXT        NOT NULL DEFAULT 'trialing',
  stripe_subscription_id TEXT        UNIQUE,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Suppression List ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppression_list (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);

-- ── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  resource     TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace    ON campaigns (workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_workspace        ON leads (workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_workspace     ON messages (workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead          ON messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_campaign   ON campaign_enrollments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_lead       ON campaign_enrollments (lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace        ON audit_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_created          ON audit_logs (created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tenant tables
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppression_list   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of the given workspace?
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;

-- Helper: current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ── Profiles RLS ──────────────────────────────────────────────────────────────
CREATE POLICY "profiles: users read own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles: users update own" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles: admins read all" ON profiles
  FOR SELECT USING (current_user_role() IN ('admin', 'super_admin'));

-- ── Workspaces RLS ───────────────────────────────────────────────────────────
CREATE POLICY "workspaces: members can select" ON workspaces
  FOR SELECT USING (is_workspace_member(id));

CREATE POLICY "workspaces: owner can update" ON workspaces
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "workspaces: authenticated can insert" ON workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Workspace Members RLS ────────────────────────────────────────────────────
CREATE POLICY "members: members can select" ON workspace_members
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "members: owner can manage" ON workspace_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid())
  );

-- ── Campaigns RLS ────────────────────────────────────────────────────────────
CREATE POLICY "campaigns: members can select" ON campaigns
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "campaigns: members can insert" ON campaigns
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "campaigns: members can update" ON campaigns
  FOR UPDATE USING (is_workspace_member(workspace_id));

CREATE POLICY "campaigns: members can delete" ON campaigns
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Campaign Steps RLS ───────────────────────────────────────────────────────
CREATE POLICY "steps: via campaign membership" ON campaign_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id AND is_workspace_member(c.workspace_id)
    )
  );

-- ── Leads RLS ────────────────────────────────────────────────────────────────
CREATE POLICY "leads: members can select" ON leads
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "leads: members can insert" ON leads
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "leads: members can update" ON leads
  FOR UPDATE USING (is_workspace_member(workspace_id));

CREATE POLICY "leads: members can delete" ON leads
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Messages RLS ─────────────────────────────────────────────────────────────
CREATE POLICY "messages: members can select" ON messages
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "messages: members can insert" ON messages
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

-- ── Integrations RLS ─────────────────────────────────────────────────────────
CREATE POLICY "integrations: members can select" ON integrations
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "integrations: members can manage" ON integrations
  FOR ALL USING (is_workspace_member(workspace_id));

-- ── Subscriptions RLS ────────────────────────────────────────────────────────
CREATE POLICY "subscriptions: members can select" ON subscriptions
  FOR SELECT USING (is_workspace_member(workspace_id));

-- ── Suppression List RLS ─────────────────────────────────────────────────────
CREATE POLICY "suppression: members can manage" ON suppression_list
  FOR ALL USING (is_workspace_member(workspace_id));

-- ── Audit Logs RLS ───────────────────────────────────────────────────────────
CREATE POLICY "audit: members can select" ON audit_logs
  FOR SELECT USING (
    workspace_id IS NULL OR is_workspace_member(workspace_id)
    OR current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "audit: service role inserts" ON audit_logs
  FOR INSERT WITH CHECK (TRUE); -- Inserts only via service_role in server actions

-- ============================================================================
-- ADMIN BOOTSTRAP
-- ============================================================================
-- Usage: Call the API route POST /api/admin/bootstrap with the secret.
-- This SQL comment documents the server-side process; nothing is run here
-- at migration time. See SETUP.md for the bootstrap procedure.
-- ============================================================================
