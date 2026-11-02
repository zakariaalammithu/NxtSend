-- Migration 021: audit_logs SELECT — platform admins only.
--
-- Problem (audit 2026-11-02): migration 001 granted SELECT on audit_logs
-- to any authenticated user whenever workspace_id IS NULL, and every
-- platform audit insert omits workspace_id. That made all platform
-- audit rows (actor emails, actions, hub credential labels /
-- environments / value_last4, disclosure reasons) readable by any
-- signed-up user through direct PostgREST with the anon key.
-- Credential VALUES were never stored in audit rows; this fix closes
-- the metadata leak.
--
-- This migration replaces the broad policy with:
--   * workspace members may select only rows scoped to their workspace
--   * platform admins / super_admins may select platform rows
--     (workspace_id IS NULL) as well as workspace rows
-- Service-role access is unaffected by RLS. The INSERT policy from
-- migration 002 (service-role only) is intentionally left untouched.
-- Apply with the other migrations, in order, before relying on it.

DROP POLICY IF EXISTS "audit: members can select" ON audit_logs;

CREATE POLICY "audit: workspace members and platform admins can select"
  ON audit_logs
  FOR SELECT USING (
    is_workspace_member(workspace_id)
    OR current_user_role() IN ('admin', 'super_admin')
  );
