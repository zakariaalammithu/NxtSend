-- ============================================================================
-- Migration 026 — OAuth codes: PKCE code_challenge becomes nullable
-- ============================================================================
-- Why: Zapier's standard OAuth2 client sends no PKCE — its canonical
-- CLI example has no code_challenge field and no official source
-- shows Zapier sending one. The authorization server therefore
-- allows confidential clients (client_secret verified) to obtain a
-- code without a challenge; public clients still REQUIRE PKCE S256
-- (see src/lib/muse-connector/oauth/authorize.ts and handlers.ts).
-- A code issued without a challenge stores NULL here, and the token
-- exchange then authenticates on the client_secret alone. A stored
-- (non-null) challenge must still be satisfied by a matching
-- verifier.
--
-- Non-destructive: only the NOT NULL constraint is dropped.
-- Existing rows (all with a challenge) are unaffected, and the
-- server keeps working before this migration is applied as long as
-- every client sends PKCE — which all current clients do.
-- ============================================================================

ALTER TABLE IF EXISTS muse_oauth_codes
  ALTER COLUMN code_challenge DROP NOT NULL;
