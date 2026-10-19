-- ============================================================================
-- NxtSend Migration 002 — Security Hardening
-- Apply AFTER 001_initial_schema.sql (Supabase SQL Editor, in order).
-- This migration is review-verified only; it has NOT been applied to any
-- live Supabase project from the build environment.
--
-- Fixes (Stage-2 security pass; references are to SAAS_AUDIT.md §13):
--
--   1. F1 CRITICAL — profiles privilege escalation.
--      In 001, policy "profiles: users update own" was
--      FOR UPDATE USING (id = auth.uid()) with no WITH CHECK and no column
--      restriction, so any signed-up user could run
--        supabase.from('profiles').update({ role: 'super_admin' })
--      on their own row and defeat the entire role model.
--
--      APPROACH (standard for this stack, three layers):
--        a) The UPDATE policy is recreated WITH CHECK (id = auth.uid()).
--        b) Column-level privileges: table-level UPDATE is revoked from the
--           client roles and re-granted only on the non-privilege columns
--           (full_name, avatar_url, updated_at). PostgreSQL privileges are
--           additive, so the table-level grant must be revoked first —
--           revoking a single column alone would NOT subtract it.
--        c) A BEFORE UPDATE trigger (profiles_guard_privileged_columns)
--           raises an exception if `role` or `status` would change while the
--           statement runs as anyone other than the service role / a
--           database owner / a SECURITY DEFINER function owner. This is
--           defence-in-depth in case grants are ever broadened again.
--      Result: role/status changes happen ONLY via the service role
--      (e.g. POST /api/admin/bootstrap, future admin server actions) or via
--      a SECURITY DEFINER function — never from the browser client.
--      Users can still update their own display fields.
--
--   2. F5 — campaign_enrollments had RLS enabled with ZERO policies in 001
--      (deny-all: the feature could never work through the API). Policies
--      are added below, scoped through the parent campaign's workspace,
--      mirroring the campaigns / campaign_steps policy style in 001.
--
--   3. F6 — audit_logs INSERT policy was WITH CHECK (TRUE) for all roles,
--      so any authenticated user could forge audit entries. Inserts are now
--      service-role-only. The only writer in the codebase,
--      POST /api/admin/bootstrap, already uses the service-role client
--      (which bypasses RLS), so existing behaviour is unchanged.
--
--   4. F8 — integrations.config (where provider API keys / tokens live) was
--      readable AND writable by every workspace member (FOR ALL USING
--      is_workspace_member). Read/write of the base table is now restricted
--      to workspace owners/admins (workspace_members.role). Regular members
--      keep status-level visibility through the redacted view
--      `integrations_status`, which exposes NO config column. (Verified:
--      no code in src/ queries the integrations table today — the dashboard
--      integrations page renders demo data — so nothing existing breaks.)
--
--   5. F9 — workspaces INSERT policy only required a signed-in user, so a
--      user could create workspaces owned by someone else. owner_id is now
--      forced to auth.uid(). The signup flow already inserts owner_id = the
--      new user's own id, so it is unaffected.
--
--   6. profiles.status ('active' | 'suspended') — 001 had no account-status
--      field, so admin suspension could not persist. The column is added
--      here, and it is write-protected by the same trigger as `role`
--      (a suspended user must not be able to reactivate themselves).
--
-- TODO (application layer, intentionally NOT in this migration):
--   Suspension ENFORCEMENT — middleware / getCurrentUser() must reject or
--   sign out users whose profiles.status = 'suspended' once the admin
--   suspension UI is wired to real data (Stage-2 item 8). The column and its
--   write protection land here so the data model is ready; until the
--   app-layer check ships, suspension is recorded but not yet enforced
--   at login.
-- ============================================================================

-- ── 6 (first, so the trigger below can reference it): profiles.status ───────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$ BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1a. Profiles UPDATE policy: add WITH CHECK ───────────────────────────────
DROP POLICY IF EXISTS "profiles: users update own" ON profiles;
CREATE POLICY "profiles: users update own" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── 1b. Column-level privileges: client roles may update display fields only ─
-- (Table-level UPDATE must be revoked first; PostgreSQL grants are additive.)
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, avatar_url, updated_at) ON public.profiles TO authenticated;
-- service_role keeps its existing full access (bootstrap / admin actions).

-- ── 1c. Trigger guard: role/status changes only via service role / owner ─────
-- NOTE: this function is deliberately NOT SECURITY DEFINER, so current_user
-- inside the trigger is the role executing the UPDATE (authenticated for
-- browser clients, service_role for server admin calls, postgres in the
-- SQL editor). SECURITY DEFINER functions run as their owner and are an
-- allowed path by design.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'profiles.role and profiles.status can only be changed via the service role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_columns();

-- ── 2. campaign_enrollments policies (RLS already enabled in 001) ────────────
DROP POLICY IF EXISTS "enrollments: members can select" ON campaign_enrollments;
CREATE POLICY "enrollments: members can select" ON campaign_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id AND is_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "enrollments: members can insert" ON campaign_enrollments;
CREATE POLICY "enrollments: members can insert" ON campaign_enrollments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      JOIN leads l ON l.id = lead_id
      WHERE c.id = campaign_id
        AND l.workspace_id = c.workspace_id
        AND is_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "enrollments: members can update" ON campaign_enrollments;
CREATE POLICY "enrollments: members can update" ON campaign_enrollments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id AND is_workspace_member(c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      JOIN leads l ON l.id = lead_id
      WHERE c.id = campaign_id
        AND l.workspace_id = c.workspace_id
        AND is_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "enrollments: members can delete" ON campaign_enrollments;
CREATE POLICY "enrollments: members can delete" ON campaign_enrollments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id AND is_workspace_member(c.workspace_id)
    )
  );

-- ── 3. audit_logs: service-role-only inserts ─────────────────────────────────
DROP POLICY IF EXISTS "audit: service role inserts" ON audit_logs;
CREATE POLICY "audit: service role inserts" ON audit_logs
  FOR INSERT TO service_role WITH CHECK (TRUE);
-- No INSERT policy exists for anon/authenticated, so client-side inserts are
-- denied by RLS. The service role bypasses RLS in any case; this policy
-- documents the intent. The SELECT policy from 001 is unchanged.

-- ── 4. integrations: owner/admin-only access to rows incl. config ───────────
CREATE OR REPLACE FUNCTION is_workspace_admin(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

DROP POLICY IF EXISTS "integrations: members can select" ON integrations;
DROP POLICY IF EXISTS "integrations: members can manage" ON integrations;

CREATE POLICY "integrations: admins can select" ON integrations
  FOR SELECT USING (is_workspace_admin(workspace_id));

CREATE POLICY "integrations: admins can insert" ON integrations
  FOR INSERT WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "integrations: admins can update" ON integrations
  FOR UPDATE USING (is_workspace_admin(workspace_id));

CREATE POLICY "integrations: admins can delete" ON integrations
  FOR DELETE USING (is_workspace_admin(workspace_id));

-- Status-level visibility for regular members: a redacted view WITHOUT the
-- config column. The view runs with its owner's rights (the standard
-- redacted-view pattern), but its WHERE clause scopes rows to the caller's
-- own workspaces via is_workspace_member(), which reads auth.uid().
CREATE OR REPLACE VIEW integrations_status AS
  SELECT id, workspace_id, provider, status, updated_at
  FROM integrations
  WHERE is_workspace_member(workspace_id);

GRANT SELECT ON integrations_status TO authenticated;

-- ── 5. workspaces: owner_id forced to the creator ────────────────────────────
DROP POLICY IF EXISTS "workspaces: authenticated can insert" ON workspaces;
CREATE POLICY "workspaces: authenticated can insert" ON workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- ============================================================================
-- End of Migration 002
-- ============================================================================
