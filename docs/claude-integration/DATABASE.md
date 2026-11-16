# Database

## No new migration, no new tables

Claude reuses the OAuth tables created by **migration 023**
(`023_muse_oauth.sql`) and the resource column added by **migration
024** (`024_chatgpt_oauth_resource.sql`). There is **no new migration
for Claude and no new OAuth table**. If 023 + 024 are already applied
(for Muse / ChatGPT), nothing further is needed for Claude.

| Table | Purpose | Claude use |
|---|---|---|
| `muse_oauth_clients` | DCR-registered clients (`client_id`, `client_secret_hash`, `name`, `redirect_uris`, `created_at`) | Claude clients registered via DCR land here. CIMD clients do **not** — they are ephemeral and never persisted. |
| `muse_oauth_codes` | Authorization codes (SHA-256 hash, client, user, workspace, scopes, `resource`, expiry, PKCE challenge) | Claude codes, with `resource` = `https://<origin>/api/mcp/claude`. |
| `muse_oauth_tokens` | Access + refresh tokens (SHA-256 hashes, client, user, workspace, scopes, `resource`, expiry, `kind`, `rotated_from_hash`) | Claude tokens, resource-bound to `/api/mcp/claude`. |

Migration 024 adds a nullable `resource TEXT` column to both
`muse_oauth_codes` and `muse_oauth_tokens` plus index
`idx_muse_oauth_tokens_resource`. Nullable on purpose (legacy rows =
Muse resource); the store retries inserts without the column
pre-migration.

## RLS

All three tables are **RLS-enabled with zero policies — service role
only**. No row is readable or writable from a client-side key. The
OAuth store (`src/lib/muse-connector/oauth/store.ts`) runs through
the Supabase service-role client.

## What is stored — and what is not

- **Stored:** client metadata (DCR), SHA-256 hashes of codes and
  tokens, grant linkage (client + user + workspace + scopes +
  resource), expiries, rotation linkage (`rotated_from_hash`).
- **Never stored:** token or code *values*, client secrets in
  plaintext (hash only, returned once at registration), CIMD client
  documents (fetched per request, cached in memory ~5 min only),
  "last used" times (the UI says "not tracked", never invented).
- **No plan on the grant:** the grant carries no plan, which is why
  the `nxtsend://account` resource deliberately omits it. The
  workspace plan is read live by the `get_profile` tool, not stored
  on the grant.

## Grant origin classification

The admin overview and the Integration Center split grants by client
origin (`countActiveGrantsByOrigin` /
`summarizeGrantsByOrigin` in `src/lib/muse-connector/grants.ts`).
Classification is by the client's identity, never by scope prefix
alone:

1. A CIMD `client_id` that is an https URL: `claude.ai` /
   `claude.com` → Claude, `chatgpt.com` → ChatGPT,
   `agent.meta.ai` → Muse.
2. Otherwise the registered redirect URIs decide (Claude callback →
   Claude, ChatGPT callback → ChatGPT, Muse callback → Muse). A
   client carrying the ChatGPT callback wins over Muse when both are
   listed.
3. Anything else (e.g. loopback-only clients) is "Other" — unless the
   scope prefix disambiguates it as a fallback (`claude.*` → Claude,
   `nxtsend.*` → ChatGPT, `muse.*` → Muse).

Counts are distinct client + user pairs with a live refresh token,
per workspace (Integration Center) or platform-wide (admin).

## Applying the migrations

In Supabase (SQL editor or CLI), apply in order:

1. `supabase/migrations/023_muse_oauth.sql`
2. `supabase/migrations/024_chatgpt_oauth_resource.sql`

Both are idempotent as written for the project; verify with
`GET /api/admin/muse` (admin) — a null grant count means the tables
could not be read, which usually means migration 023 is not applied.
The `claude-mcp` System Health check reports the same condition.
