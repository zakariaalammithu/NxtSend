# NxtSend × Zapier Integration

NxtSend is the **server** in this integration: Zapier calls **into**
NxtSend (REST API + REST Hook webhooks) on behalf of a signed-in
NxtSend user. The Zapier Platform CLI app in `integrations/zapier/`
is the client; the REST API, OAuth extension and webhook outbox in
`src/lib/integrations/zapier/` + `src/app/api/integrations/zapier/`
are the server.

**Status: implemented, unit-tested, NOT verified live, NOT published.**
No live Supabase project and no Zapier developer account were used
from this environment. Nothing has been submitted to Zapier, and the
app does not appear in Zapier's directory. See
[TESTING.md](TESTING.md) and [PUBLISHING.md](PUBLISHING.md) for what
is still pending.

## What you get

| Surface | Inventory |
|---|---|
| OAuth 2.0 (shared server, extended) | Scopes `zapier.read` + `zapier.write` only (no `.send`); resource `https://<origin>/api/integrations/zapier`; DCR-registered client; PKCE optional for confidential clients only; 10-minute refresh-token reuse grace for Zapier grants only |
| REST API v1 (`/api/integrations/zapier/v1/*`) | 28 routes: auth/test, leads, campaigns, conversations, accounts, usage, 4 searches, 4 dropdowns, webhooks — plus a public health endpoint and the server-side emit endpoint |
| Webhooks (REST Hooks) | 8 events, per-subscription HMAC secrets, outbox with best-effort immediate delivery + daily 06:00 cron retry (max 3 attempts, then `dead`) |
| Zapier CLI app (`integrations/zapier/`) | 5 polling triggers, 8 instant triggers, 12 actions, 5 searches, 4 hidden dropdown triggers; `zapier-platform-core` 18.6.0; `zapier-platform validate` exit 0; package tests 60/60 |
| Settings UI + admin | Integration Center entry (grant-only "Connected"), detail page with live grants/endpoints/trigger-action inventory, admin panel with grants/subscriptions/delivery failures |

## Docs in this folder

| File | Covers |
|---|---|
| [ZAPIER_SERVER.md](ZAPIER_SERVER.md) | Server-side implementation detail (written by the server agent — OAuth decisions, endpoint table, delivery design, omissions). The 14 files below do not duplicate it; they reference it. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, components, data flow, files changed |
| [AUTHENTICATION.md](AUTHENTICATION.md) | OAuth flow, scopes, DCR registration, PKCE + rotation-grace decisions, token lifecycle |
| [TRIGGERS.md](TRIGGERS.md) | 5 polling + 8 instant triggers, dedup, latency |
| [ACTIONS.md](ACTIONS.md) | 12 actions, transition rules, idempotency, limits |
| [SEARCHES.md](SEARCHES.md) | 5 searches, search-or-creates, dropdowns |
| [WEBHOOKS.md](WEBHOOKS.md) | REST Hook subscriptions, events, signing, delivery + retry, latency honesty |
| [API_REFERENCE.md](API_REFERENCE.md) | Every endpoint: method, auth, inputs, outputs, errors |
| [SECURITY.md](SECURITY.md) | Threat model, token storage, secrets, RLS, LinkedIn boundary |
| [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) | Env vars, migrations, deploy checklist |
| [ZAPIER_SETUP.md](ZAPIER_SETUP.md) | Owner steps in the Zapier developer dashboard |
| [TESTING.md](TESTING.md) | What was tested, how to re-run, what is still PENDING live |
| [PUBLISHING.md](PUBLISHING.md) | Zapier review / Beta / Public path — NOT claimed |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common failures and what they mean |

## The three hard limits (read before promising anything)

1. **LinkedIn is NOT SUPPORTED.** No authorized LinkedIn provider
   exists; the official LinkedIn API exposes no connection-request/DM
   endpoints to standard developers. There is no LinkedIn-send action
   or trigger, LinkedIn replies are refused 422, and campaign
   `accepted` is always `null` (no data source exists — never
   fabricated).
2. **Instant triggers are not instant-guaranteed.** Delivery is
   best-effort immediate + retries on the **daily 06:00 cron**; a
   failed delivery may wait **up to ~24h** for its next retry.
3. **Nothing is published or verified live.** The OAuth grant flow
   inside Zapier, one live run per trigger/action/search, REST-hook
   delivery to a real `hooks.zapier.com` URL, migrations 025–027 on
   live Supabase, and the cron retry tick are all PENDING.

## Quickstart (owner)

1. Apply migrations 025–027 in the Supabase SQL Editor.
2. Register the Zapier OAuth client (one-time DCR curl in
   [ZAPIER_SERVER.md](ZAPIER_SERVER.md)) and store the returned
   `client_id` / `client_secret` in the Zapier developer dashboard.
3. In Zapier: create the app, set `CLIENT_ID` / `CLIENT_SECRET` /
   `ZAPIER_APP_BASE_URL`, run `zapier-platform validate` and `push`.
4. Connect an account in the Zapier editor and build a Zap.

Details: [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) +
[ZAPIER_SETUP.md](ZAPIER_SETUP.md).
