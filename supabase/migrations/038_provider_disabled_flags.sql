-- ============================================================================
-- Migration 038 — Provider disable flags (Wave 2, Phase 2: admin monitoring)
-- ============================================================================
-- Why: a platform super-admin must be able to disable a provider
-- (new connections / calls then refuse with an honest error) without
-- touching env vars or redeploying. One row per provider id; only
-- rows with disabled = true have an effect, so an empty table means
-- "nothing disabled". The provider id is free TEXT validated against
-- the provider registry in application code
-- (src/lib/admin/integration-monitoring.ts) — no CHECK constraint,
-- so a future provider never needs a migration to be flaggable.
--
-- RLS: enabled, ZERO policies — service-role only, same pattern as
-- migrations 023/025/028/030. No client (browser) access. The flag
-- is read/written only through the super-admin-gated admin API
-- (src/app/api/admin/integrations/monitoring/[provider]/disable).
--
-- Enforcement note: the flag is CHECKED by
-- `assertProviderEnabled()` in src/lib/admin/integration-monitoring.ts,
-- called from the shared REST auth gate `resolveRestContext()`
-- (src/lib/integrations/rest/auth.ts) — a disabled automation platform
-- (zapier, n8n, make, pabbly, albato, activepieces) refuses every REST
-- call with 503 provider_disabled. The workspace connect flow for
-- config-ready adapters does not call it yet, so other providers'
-- flags are recorded and displayed but not yet enforced. Disabling
-- never deletes stored connections. Do not claim otherwise.
--
-- Non-destructive, additive only.
--
-- STATUS: written, not applied. Apply in the Supabase SQL Editor
-- alongside migrations 023–031 and re-test. Until it is applied the
-- monitoring API reports `disabledFlagsUnknown: true` and the
-- disable toggle returns 503 instead of pretending to save.
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_disabled_flags (
  provider    TEXT        PRIMARY KEY,
  disabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  disabled_by UUID,
  disabled_at TIMESTAMPTZ,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_disabled_flags_disabled
  ON provider_disabled_flags (disabled);

ALTER TABLE provider_disabled_flags ENABLE ROW LEVEL SECURITY;
