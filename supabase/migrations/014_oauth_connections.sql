-- ============================================================================
-- Migration 014 — OAuth mailbox connections: encrypted token vault (P5 Stage G)
-- ============================================================================
-- Why: until now NxtSend could only send email through Resend
-- (RESEND_API_KEY + EMAIL_FROM). Campaigns select a per-campaign email
-- account (migration 011: campaigns.email_account_id), but that record
-- never affected sending — there was nowhere to keep a mailbox grant.
-- Stage G adds real Gmail / Outlook (Microsoft 365) mailbox sending
-- via OAuth 2.0 authorization-code flows, which requires storing
-- access + refresh tokens. Tokens are credentials: they are stored
-- ONLY here, ONLY encrypted (AES-256-GCM, keyed by the server-only
-- TOKEN_ENCRYPTION_KEY env var — the ciphertext columns below never
-- hold plaintext), and ONLY reachable through the service role.
--
--   * `oauth_connections` — one row per connected mailbox grant.
--     `account_id` links the grant to its sending identity in
--     `connected_accounts` (migration 011); deleting the account
--     deletes the grant (ON DELETE CASCADE) so tokens never outlive
--     the identity they belong to. UNIQUE(account_id): one live grant
--     per account — reconnecting REPLACES the stored tokens.
--   * `provider` is the OAuth provider ('google' | 'microsoft');
--     the connected_accounts row carries the sending provider label
--     ('gmail' | 'microsoft').
--   * `status` is the RECORDED grant state: active / needs_reconnect
--     (a refresh failed — the user must re-run the OAuth flow) /
--     disconnected / error. Written by the OAuth service + adapters;
--     it mirrors connected_accounts.auth_status (migration 013) for
--     the account.
--
-- RLS: ENABLED with NO client policies at all — deliberately. There is
-- no legitimate browser access to this table, not even metadata: the
-- Integration Center and Connected Accounts pages receive mailbox
-- metadata (provider, address, status, token expiry — never token
-- material) from guarded API routes that run server-side through the
-- service role after session + workspace checks. Any anon/authenticated
-- role query against this table returns zero rows.
--
-- Like migrations 001–013 this file is applied by the owner at
-- go-live; nothing here has been run against a live database.
-- ============================================================================

-- ── OAuth connections ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_connections (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id             UUID        NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  provider               TEXT        NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_email TEXT        NOT NULL,
  scopes                 TEXT,
  access_token_enc       TEXT        NOT NULL,
  refresh_token_enc      TEXT,
  token_expires_at       TIMESTAMPTZ,
  status                 TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'needs_reconnect', 'disconnected', 'error')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_workspace
  ON oauth_connections (workspace_id);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_account
  ON oauth_connections (account_id);

-- Service-role only: RLS on, zero policies (see header). The service
-- role bypasses RLS; every other role is denied by the absence of a
-- policy, so OAuth tokens are unreachable from the browser by
-- construction.
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
