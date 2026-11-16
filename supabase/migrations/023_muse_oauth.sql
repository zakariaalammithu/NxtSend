-- ============================================================================
-- Migration 023 — Muse (Meta) Connector OAuth 2.1 server (P5 Stage H)
-- ============================================================================
-- Why: NxtSend is the server in the Muse Connector Platform — Muse
-- calls INTO NxtSend on behalf of a NxtSend user, authenticated with
-- OAuth 2.0 authorization-code + PKCE (S256) that NxtSend issues
-- (see src/lib/muse-connector/oauth/). This migration adds the three
-- tables that server needs. Nothing here has been submitted to Meta;
-- the connector manifest (src/lib/muse-connector/manifest.ts) remains
-- a pre-classified draft.
--
--   * `muse_oauth_clients` — OAuth clients registered by Dynamic
--     Client Registration (RFC 7591, POST /api/muse/oauth/register).
--     Default clients are PUBLIC (no secret — `client_secret_hash`
--     is NULL); a confidential client is only created when explicitly
--     requested, and its secret is stored as a SHA-256 hash, never
--     in plaintext. `redirect_uris` is an allowlist: every URI must
--     be either the Muse callback
--     (https://agent.meta.ai/api/hatch/oauth/callback) or a
--     loopback http://localhost:* URI (local testing only).
--   * `muse_oauth_codes` — authorization codes. Stored as SHA-256
--     hashes only; 10-minute expiry; single use (`used_at`).
--   * `muse_oauth_tokens` — access (1h) and refresh (60d) tokens.
--     Stored as SHA-256 hashes only — a database read can never
--     yield a usable token. `rotated_from_hash` links a refresh
--     token to the one it replaced, so presenting an already-rotated
--     refresh token is detectable as reuse and revokes the whole
--     grant (all tokens for that client + user).
--
-- RLS: ENABLED with NO client policies at all — deliberately, like
-- migration 014. There is no legitimate browser access to these
-- tables, not even metadata: every read/write goes through the
-- service role from the OAuth routes / core logic
-- (src/lib/muse-connector/oauth/store.ts). Any anon/authenticated
-- role query against these tables returns zero rows.
--
-- No seeded content: no client, code or token row is created here.
-- Like migrations 001–022 this file is applied by the owner at
-- go-live; nothing here has been run against a live database.
-- ============================================================================

-- ── Muse OAuth clients ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse_oauth_clients (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          TEXT        NOT NULL UNIQUE,
  client_secret_hash TEXT,
  name               TEXT        NOT NULL,
  redirect_uris      TEXT[]      NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_clients_created
  ON muse_oauth_clients (created_at);

-- ── Muse OAuth authorization codes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse_oauth_codes (
  code_hash      TEXT        PRIMARY KEY,
  client_id      TEXT        NOT NULL,
  user_id        UUID        NOT NULL,
  workspace_id   UUID        NOT NULL,
  scopes         TEXT[]      NOT NULL DEFAULT '{}',
  code_challenge TEXT        NOT NULL,
  redirect_uri   TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_codes_client
  ON muse_oauth_codes (client_id);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_codes_expires
  ON muse_oauth_codes (expires_at);

-- ── Muse OAuth tokens ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse_oauth_tokens (
  token_hash        TEXT        PRIMARY KEY,
  kind              TEXT        NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id         TEXT        NOT NULL,
  user_id           UUID        NOT NULL,
  workspace_id      UUID        NOT NULL,
  scopes            TEXT[]      NOT NULL DEFAULT '{}',
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  rotated_from_hash TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_tokens_grant
  ON muse_oauth_tokens (client_id, user_id);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_tokens_rotated_from
  ON muse_oauth_tokens (rotated_from_hash);

CREATE INDEX IF NOT EXISTS idx_muse_oauth_tokens_expires
  ON muse_oauth_tokens (expires_at);

-- Service-role only: RLS on, zero policies (see header). The service
-- role bypasses RLS; every other role is denied by the absence of a
-- policy, so OAuth client/code/token material is unreachable from the
-- browser by construction.
ALTER TABLE muse_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE muse_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE muse_oauth_tokens ENABLE ROW LEVEL SECURITY;
