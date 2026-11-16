# Database

## Migrations

| Migration | Contents |
|---|---|
| `023_muse_oauth.sql` | Creates `muse_oauth_clients`, `muse_oauth_codes`, `muse_oauth_tokens` (RLS enabled, **zero policies** — service role only). Shared by the Muse and ChatGPT surfaces; the tables are client-agnostic (`client_id` identifies the client). |
| `024_chatgpt_oauth_resource.sql` | Adds nullable `resource TEXT` to `muse_oauth_codes` and `muse_oauth_tokens`, plus index `idx_muse_oauth_tokens_resource`. No new tables. |

Both migrations must be applied for the ChatGPT surface to work in
live mode. The Supabase store retries inserts **without** the
`resource` column when the column does not exist yet, so issuance
keeps working before migration 024 is applied — but resource binding
is then unenforced for those rows (they are treated as legacy tokens
bound to the canonical Muse resource `/api/mcp`).

## Tables

### `muse_oauth_clients`

One row per DCR-registered client. CIMD clients are **never** stored
here (ephemeral, validated per request).

| Column | Notes |
|---|---|
| `id` | Internal id |
| `client_id` | Opaque DCR id |
| `client_secret_hash` | Null for public clients (the default); set only for confidential DCR clients |
| `name` | Display name shown on the consent screen |
| `redirect_uris` | Exact-match allowlist for this client |
| `created_at` | |

Cap: 50 clients; the oldest never-used client may be evicted past the
cap (see `MUSE_MAX_CLIENTS` / `MUSE_CLIENT_EVICTION_AGE_MS` in
`src/lib/muse-connector/oauth/clients.ts`).

### `muse_oauth_codes`

| Column | Notes |
|---|---|
| `code_hash` | SHA-256 of the authorization code (never the code) |
| `client_id`, `user_id`, `workspace_id` | Who the code is for |
| `redirect_uri` | Must match the authorize request exactly |
| `scopes` | Granted scopes (subset of the six known scopes) |
| `code_challenge`, `code_challenge_method` | PKCE (S256 only) |
| `resource` | RFC 8707 resource URL, or null (legacy) — migration 024 |
| `expires_at` | 10 min from issue; single-use (consumed on exchange) |

### `muse_oauth_tokens`

| Column | Notes |
|---|---|
| `token_hash` | SHA-256 of the token (never the token) |
| `kind` | `access` (1 h) or `refresh` (60 d, rotating) |
| `client_id`, `user_id`, `workspace_id` | Grant identity |
| `scopes` | Granted scopes |
| `resource` | RFC 8707 audience binding, or null (legacy = Muse resource) — migration 024 |
| `expires_at`, `revoked_at` | Revocation sets `revoked_at`; rotation revokes the old refresh token |
| `rotated_from_hash` | Links a rotated refresh token to its predecessor (reuse detection) |

## What is NOT stored

- No token or code **values** (hashes only).
- No "last used" time — migration 023 stores none, so the UI reports
  "Last used: not tracked" rather than inventing one.
- No CIMD documents, no client secrets for CIMD clients.
- No message bodies in the audit log (`audit_logs` carries action,
  resource label and plain-language detail only).

## Queries the app runs (service role only)

- **Grants list** (`listMuseGrants`): selects only safe columns
  (`client_id, kind, scopes, expires_at, revoked_at, created_at`) —
  `token_hash` is never selected.
- **Active-grant counts**: `countActiveMuseGrants` (all origins) and
  `countActiveGrantsByOrigin` (Muse vs ChatGPT vs Other, classified by
  client identity with the scope prefix as fallback). Both return
  `null` when the tables cannot be read (e.g. migration 023 not
  applied) — callers treat null as "unknown", never as zero.
- **Status route**: workspace-filtered counts feed the Integration
  Center statuses (`museGrantsActive`, `chatgptGrantsActive`).

## Applying the migrations

In the Supabase SQL Editor, run in order:

1. `supabase/migrations/023_muse_oauth.sql`
2. `supabase/migrations/024_chatgpt_oauth_resource.sql`

Both are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).
Verify with:

```sql
select count(*) from muse_oauth_tokens where resource is not null;
-- 0 before any ChatGPT grant; grows as ChatGPT grants are issued.
```
