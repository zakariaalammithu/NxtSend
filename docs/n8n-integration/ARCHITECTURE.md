# Architecture — NxtSend × n8n

## Direction

NxtSend is the **server**; n8n is the **client**. n8n calls into
NxtSend. NxtSend never calls into n8n except to deliver webhook
events to a Trigger node's webhook URL.

```
┌──────────────┐  OAuth2 / API key   ┌───────────────────────────────┐
│  n8n instance│ ──────────────────► │ NxtSend (Next.js, Vercel)     │
│              │  REST /v1 + webhooks│  /api/integrations/n8n/*      │
│  NxtSend node│ ◄── webhook events ─ │  /api/muse/oauth/* (shared)   │
│  NxtSend     │    (HMAC-signed)    │  Supabase (migrations 028–29) │
│  Trigger     │                     └───────────────────────────────┘
└──────────────┘
```

## Components

| Component | Location | Status at writing |
|---|---|---|
| REST API v1 (leads, campaigns, sequences, conversations, accounts, usage, searches, dropdowns) | `src/app/api/integrations/n8n/v1/*`, `src/lib/integrations/rest/*` (shared with Zapier), `src/lib/integrations/n8n/*` | **LANDED** — Worker A |
| Health (public) | `GET /api/integrations/n8n/health` → `{mode, n8nEnabled, version}` | **LANDED** — Worker A |
| API-key management | `GET/POST/DELETE /api/integrations/n8n/api-keys` (session auth) | **LANDED** — Worker A (migration 028, `nxtsend_api_keys`) |
| Webhook subscribe/unsubscribe/subscriptions | `/api/integrations/n8n/webhooks/*` + session `GET /api/integrations/n8n/subscriptions` | **LANDED** — Worker B |
| OAuth 2.0 extension | Shared server `src/lib/muse-connector/oauth/*`; scopes `n8n.read` / `n8n.write`; resource `/api/integrations/n8n`; grants-by-origin `n8n` branch; 10-min refresh grace for n8n + Zapier | **LANDED** — Worker B |
| Webhook outbox + cron retry | Shared webhook tables with `platform` discriminator (migration 029, written not applied) + jobs worker (`/api/jobs/run`, daily 06:00) | **LANDED (code) / NOT APPLIED (migration 029)** — Worker B |
| Community node + templates | `integrations/n8n-nodes-nxtsend/` (v0.1.0), 12 templates in `workflows/` | **LANDED** — Worker C: credentials + properties + shared constants + main node + Trigger node + 5 test suites (126 tests, all passing) + 12 templates; package `npm run build` passes |
| Settings UI | `src/lib/integrations-center/registry.ts` (`n8n` entry), `status.ts` (n8n case), `verify.ts` (n8n case), detail page `N8nLivePanels` + API-key section | **Implemented** (this work) |
| Admin | `src/app/api/admin/n8n/route.ts`, `src/app/(admin)/admin/integrations/n8n/page.tsx`, health check in `getSystemHealth()`, nav entry | **Implemented** (this work) |
| Config | `.env.example` (`N8N_INTEGRATION_ENABLED`, `N8N_API_BASE_URL`), `src/lib/config-status.ts` | **Implemented** (this work) |

## Data flow

### Authenticated read/write (node action / search)

1. n8n presents either an OAuth access token (resource-bound to
   `/api/integrations/n8n`, RFC 8707) or an API key (`X-Api-Key`).
2. The route resolves the user + workspace, enforces the scope
   (`n8n.read` for GETs, `n8n.write` for mutations), and calls the
   same loaders the dashboard uses (`loadCampaignStats`, lead
   store, etc.). No data is fabricated: `accepted` in campaign
   performance is always `null` — no data source exists.
3. Every mutating call writes an `n8n.*` audit entry.

### Webhook event (Trigger node)

1. A mutation (lead created, campaign status changed, reply sent,
   …) emits an event through the shared emission path.
2. The event is written to the outbox; a best-effort immediate
   delivery attempt is made to each active subscription's
   `target_url`.
3. On failure the delivery stays in the outbox; the daily 06:00
   cron retries with 5m → 30m backoff, max 3 attempts, then the
   delivery is `dead`. A 410 from n8n deactivates the subscription.

### API-key lifecycle

1. The user creates a key on Settings → Integrations → n8n (name +
   scopes + optional expiry). The server returns the plaintext key
   **once**; only a hash is stored.
2. n8n sends the key as `X-Api-Key` (per the contract). The server
   hashes, looks up, checks scopes/expiry/revocation, and updates
   `last_used_at`.
3. Revocation is immediate: the next call with that key gets 401.

## Files changed by this work (settings UI + admin + docs)

- `src/lib/integrations-center/registry.ts` — `n8n` entry
- `src/lib/integrations-center/status.ts` — `n8n` case + local
  `isN8nEnabled` / `getN8nBaseUrl` (mirrors Zapier config; no
  `src/lib/integrations/n8n/config.ts` was ever created — the
  n8n platform config lives in the shared
  `src/lib/integrations/rest/config.ts` as `N8N_PLATFORM`)
- `src/lib/integrations-center/verify.ts` — `n8n` case
- `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` —
  `N8nLivePanels` + dispatch branch
- `src/components/dashboard/IntegrationCenterBits.tsx` — `n8n`
  icon (`Workflow`)
- `src/app/api/admin/n8n/route.ts` — new admin overview
- `src/app/(admin)/admin/integrations/n8n/page.tsx` — new admin page
- `src/lib/admin/platform-server.ts` — n8n health check
- `src/lib/admin/nav.ts` — n8n nav entry
- `src/app/api/integrations/status/route.ts` — `n8nGrantsActive`
  plumbing (null until Worker B's grants-by-origin branch lands)
- `.env.example`, `src/lib/config-status.ts` — N8N vars
- `src/lib/integrations-center/__tests__/center.test.ts` — n8n tests
- `docs/n8n-integration/` — this folder (17 files)

## What the Zapier integration taught this design

The n8n surface deliberately reuses the Zapier surface's proven
shape: same shared OAuth server, same 8 webhook events, same
outbox + daily-cron retry, same audit-action convention
(`<platform>.*`), same grant-only "Connected" rule. The
differences are: API keys as a second auth path (Zapier has
none), a session-authenticated subscriptions/deliveries route
(Zapier's gap, closed here), and a community node package instead
of a Platform CLI app.
