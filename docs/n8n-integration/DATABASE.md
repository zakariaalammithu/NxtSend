# Database — NxtSend × n8n

**Status: migration 029 LANDED (written, not applied); migration
028 LANDED (written, not applied).** Verified by reading the files
(2026-11-18, coordinator pass). The original plan — "028 + 029 create n8n
tables" — is **wrong in one important respect**: there are no
separate `n8n_webhook_*` tables. Worker B reused the Zapier
outbox instead. This page documents what actually exists.

## Migration 029 — webhook platform discriminator (LANDED, written not applied)

File: `supabase/migrations/029_n8n_webhook_platform.sql`.

- Adds `platform TEXT NOT NULL DEFAULT 'zapier' CHECK
  (platform IN ('zapier', 'n8n'))` to
  `zapier_webhook_subscriptions` and to
  `zapier_webhook_deliveries`.
- Tables keep their `zapier_` names **on purpose**: renaming
  them would break the live Zapier integration. The platform
  column is the discriminator — do NOT rename the tables.
- Non-destructive, additive only: existing Zapier rows keep
  their meaning (default `'zapier'`).
- Deliveries inherit their platform from their subscription at
  enqueue time; the denormalised column on deliveries lets the
  retry worker filter by platform without joining.
- Indexes: `idx_zapier_subs_platform` (platform, workspace_id,
  event, active) and `idx_zapier_deliveries_platform_due`
  (platform, status, next_retry_at, failed only).
- The 8 events: `lead.created`, `lead.updated`,
  `lead.added_to_campaign`, `lead.removed_from_campaign`,
  `campaign.created`, `campaign.status_changed`,
  `conversation.reply_created`, `subscription.changed`.

## Migration 028 — API keys / v1 API (LANDED, written not applied)

File: `supabase/migrations/028_nxtsend_api_keys.sql`.

- Table `nxtsend_api_keys` (not `n8n_api_keys`) — `id`,
  `workspace_id`, `user_id`, `name`, `key_hash` (never selected
  by any read path except the authentication lookup, and never
  returned), `key_prefix` (display only), `scopes` (`n8n.read`
  / `n8n.write`), `created_at`, `last_used_at`, `expires_at`,
  `revoked_at`.
- RLS enabled, zero policies — service-role only.
- The create route returns the plaintext key **once**; only the
  hash is stored.
- Until 028 is applied, the admin route's API-key counts read as
  unknown (null) and the settings page's API-key section
  reports its fetch error honestly.

## Shared tables (already exist)

- `muse_oauth_tokens` / `muse_oauth_clients` (migration 023):
  OAuth grants. Worker B adds the `n8n` branch to
  `countActiveGrantsByOrigin` — until then `n8n.*` grants are
  classified as `other`.
- `audit_logs`: `n8n.*` entries for every mutating API call,
  key create/revoke, and webhook subscribe/unsubscribe.
- `leads`, `campaigns`, `conversations`, `leads.updated_at`
  (migration 027): the records the API operates on. No new
  columns are needed for n8n.

## What must never be selected

- `nxtsend_api_keys.key_hash` (migration 028, written not applied)
- `zapier_webhook_subscriptions.secret` for `platform='n8n'`
  rows (per-subscription HMAC secret — never selected)
- Any webhook payload containing lead data

The admin route selects only the safe columns listed above; the
session routes (`/api/integrations/n8n/api-keys`,
`/api/integrations/n8n/subscriptions`) do the same. If a future
query adds one of these columns, it is a security bug — report
it, do not ship it.
