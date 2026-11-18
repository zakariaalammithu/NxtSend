# Security

How the integration ecosystem protects credentials, tokens, and tenant
data — and what it deliberately does not expose. All claims below were
read from the code at base commit `f8dea22`.

## 1. Encryption at rest

| Secret | Protection | Key / source |
| --- | --- | --- |
| Mailbox OAuth tokens (Gmail/Outlook) | AES-256-GCM | `TOKEN_ENCRYPTION_KEY` (base64, 32 bytes; `openssl rand -base64 32`). Migration 014, `oauth_connections`. Unset/malformed → mailbox connect refuses before any redirect. |
| Integration Hub credentials (the 64 adapters' API keys/tokens) | AES-256-GCM | `INTEGRATION_HUB_ENCRYPTION_KEY` — a **dedicated key, separate from `TOKEN_ENCRYPTION_KEY`**. Migration 016, `hub_credentials`. Losing or rotating it makes stored Hub credentials undecryptable — they must be re-entered. |
| n8n API keys | SHA-256 hash only — the plaintext is **never persisted**; the full key is shown once at creation and never again | Migration 028, `nxtsend_api_keys` |
| Webhook subscription secrets | Per-subscription secret, generated server-side | Never returned by any API response (see §3) |
| `ADMIN_BOOTSTRAP_SECRET` | One-time super-admin bootstrap secret | Must be removed after first use (see `SETUP.md` §5) |

## 2. Row-Level Security (RLS) and workspace isolation

- Supabase RLS is the tenant boundary: every integration table is
  workspace-scoped, and queries are filtered by the caller's
  workspace. The REST layer resolves the workspace from the access
  token (`resolveRestContext`) — a token can only ever see its own
  workspace's leads, campaigns, conversations, subscriptions, and usage.
- **Zero-policy tables:** some tables created by the newer migrations
  have no RLS policy written for them yet (they are accessed only
  through the service-role server code, never directly from the
  client). That is the current design, not an oversight to fix by
  adding a permissive policy — any future client-side access must add
  a proper policy first. (If you are reviewing this: grep the
  migrations for tables without a matching policy before assuming a
  table is client-reachable.)
- The service-role key bypasses RLS and is server-only. It never
  reaches the browser.

## 3. What is NEVER exposed

- **Credential values** (API keys, OAuth access/refresh tokens,
  webhook secrets, API-key plaintexts) are never rendered in the UI,
  never returned by any API response, and never written to logs.
  Grant listings show metadata only (platform, scopes, created date).
- **Token hashes** are not exposed either — the `nxtsend_api_keys`
  table stores hashes; no endpoint returns them.
- **Client secrets for the OAuth server:** there are none in env.
  Clients are DCR-issued; Claude connects as a public client with no
  secret at all.
- **`.env.example` contains no real values** — 108 variable names and
  purposes only. `scripts/check-config.mjs` prints SET / PLACEHOLDER /
  MISSING classifications **without printing any values**.

## 4. OAuth server hardening

- PKCE S256 only (one legacy optional path — migration 026; see
  [OAUTH_SETUP.md](./OAUTH_SETUP.md)).
- Refresh-token rotation with reuse-revokes-grant; 10-minute reuse
  grace **only** for Zapier/n8n grants.
- Redirect URIs: exact-match against the client's registered URIs AND
  platform binding (a Muse client cannot use a Claude callback).
  Anything not on the allowlist is refused.
- Authorization codes live 10 minutes; tokens are bound to their
  resource (RFC 8707) and carry the issuer (RFC 9207).
- No `private_key_jwt` client authentication is supported.

## 5. Webhook security

- Per-subscription HMAC secrets; every delivery is signed.
- Subscriptions deactivate on HTTP 410 (receiver gone).
- The outbox dedups on `(event_id, subscription_id)` — a retried
  delivery re-sends the same envelope `id`, so receivers must dedup.
- Webhook secrets are never returned after creation.

## 6. Audit logging

- REST API calls and MCP tool calls are written to the audit log
  (`src/lib/integrations/rest/audit.ts` and the shared MCP adapter).
- **Limitation:** ChatGPT and Claude tool calls are all recorded as
  `muse.tool.*` (shared MCP adapter) — there is no per-client audit
  split. Do not use the audit log to attribute calls to a specific AI
  client.
- **Limitation:** the 60+ config-ready adapters write **no audit
  rows**. Their API counts in admin monitoring show as **null, not
  zero** — null means "no data", not "no usage".

## 7. Admin kill-switch

- Admins can disable a provider
  (`/api/admin/integrations/monitoring/[provider]/disable`,
  migration 038). Disabled providers' REST calls fail with
  503 `provider_disabled`.
- The flag is enforced on the **six REST automation platforms only**.
  The connect flow for config-ready adapters is **not yet gated** —
  disabling a config-ready adapter does not currently block a user
  from storing a credential for it. See
  [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

## 8. What this doc does NOT claim

- No penetration test, security audit, or live verification of any of
  the above against a deployed instance has been performed.
- The `INTEGRATION_HUB_ENCRYPTION_KEY` and `TOKEN_ENCRYPTION_KEY`
  values themselves are owner-held; if they were ever committed to
  the repo or shared, they must be rotated and all stored credentials
  re-entered (Hub credentials become undecryptable on rotation).
