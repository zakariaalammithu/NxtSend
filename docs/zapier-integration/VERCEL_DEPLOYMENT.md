# Zapier Integration — Vercel Deployment

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ZAPIER_ENABLED` | No | Set to `"false"` to disable the Zapier REST API surface. Unset (or `"true"`) means enabled. It does NOT gate the OAuth routes — the OAuth routes stay available when disabled, so a grant can never be half-issued against a dead API. |
| `ZAPIER_APP_BASE_URL` | No | Public origin advertised in the RFC 9728 protected-resource metadata (`/.well-known/oauth-protected-resource/api/integrations/zapier`). Only set this when the Zapier surface lives somewhere other than `NEXT_PUBLIC_APP_URL` — otherwise leave it unset and the app URL is used. |
| `TOKEN_ENCRYPTION_KEY` | Yes | AES-256 key (base64 of 32 bytes; generate: `openssl rand -base64 32`) reused to sign the authorize-state token. Without it the authorize endpoint returns 503. Shared with the Gmail/Outlook and Muse.ai entries. Already in `.env.example`. |
| `NEXT_PUBLIC_APP_URL` | Yes (existing) | The deployment's public origin (e.g. `https://nxtsend.com`). Used as the Zapier base URL fallback and the resource origin. |

**There is NO `ZAPIER_OAUTH_CLIENT_SECRET` and no global webhook
secret var.** The Zapier client's credentials live in the Zapier
developer dashboard (from the one-time DCR call); each webhook
subscription gets its own server-generated HMAC secret.

All three variables are already in `.env.example` (Zapier section,
with descriptions). The Integration Center registry test enforces
that every env var named in the registry exists in `.env.example`.

## Migrations (apply in order, Supabase SQL Editor)

| Migration | What it does |
|---|---|
| `025_zapier_webhooks.sql` | Creates `zapier_webhook_subscriptions` + `zapier_webhook_deliveries` (RLS enabled, zero policies, service-role only). |
| `026_oauth_pkce_optional.sql` | Drops NOT NULL on `muse_oauth_codes.code_challenge` (non-destructive). Needed before a Zapier client that sends no PKCE can obtain a code. |
| `027_leads_updated_at.sql` | Adds `leads.updated_at` (backfilled from `created_at`) + a BEFORE UPDATE trigger keeping it current. Powers `lead.updated` and the `updated_at_desc` polling order. |

Migrations 023–024 (Muse/ChatGPT/Claude OAuth tables + resource
column) must already be applied — the Zapier OAuth extension builds
on them.

## Deploy checklist

1. Set `TOKEN_ENCRYPTION_KEY` in Vercel (if not already set) and
   redeploy. Leave `ZAPIER_ENABLED` unset (enabled).
2. Apply migrations 025–027 in the Supabase SQL Editor.
3. Verify the health endpoint answers:
   `GET https://<your-domain>/api/integrations/zapier/health` →
   `{mode: "supabase", zapierEnabled: true, version: "1.0.0"}`.
4. Verify the protected-resource metadata answers:
   `GET https://<your-domain>/.well-known/oauth-protected-resource/api/integrations/zapier`.
5. Register the Zapier OAuth client (one-time DCR curl in
   [ZAPIER_SERVER.md](ZAPIER_SERVER.md)) and enter the credentials
   in the Zapier developer dashboard.
6. In the Integration Center, open the Zapier detail page: status
   should be "Connected but Not Verified" (configured, no grant
   yet) — never "Connected" before a real grant exists.
7. Connect an account from Zapier and confirm the status becomes
   "Connected and Verified" and the grant appears in the grants
   panel. (PENDING live — see [TESTING.md](TESTING.md).)

## Cron

`vercel.json` already registers a daily cron (`0 6 * * *` →
`/api/jobs/run`), which runs the `zapier_webhook_retry` job among
others. No new cron entry is needed. The route is gated by
`CRON_SECRET` and refuses to run while the secret is unset. More
frequent retries need a Vercel Pro plan (and a code change to the
retry schedule — the 06:00 daily tick is why a failed delivery may
wait up to ~24h; do not promise faster retries without changing it).

## What the deploy does NOT do

- It does not publish anything on Zapier (see
  [PUBLISHING.md](PUBLISHING.md)).
- It does not create the Zapier app or the OAuth client — those are
  owner steps in the Zapier developer dashboard (see
  [ZAPIER_SETUP.md](ZAPIER_SETUP.md)).
