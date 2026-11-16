# Zapier Integration — Architecture

## Direction

Zapier is the **client**, NxtSend is the **server**. Zapier calls
into NxtSend on behalf of a signed-in NxtSend user; NxtSend never
calls Zapier except to deliver webhook events to a Zapier-owned
`hooks.zapier.com` URL. This is the opposite direction from the
AI-drafting integrations (OpenAI/Anthropic/Meta), and the same
direction as the Muse/ChatGPT/Claude connectors — but Zapier speaks
**REST + OAuth 2.0**, not MCP.

```
Zapier editor / Zaps ──OAuth 2.0──▶ NxtSend OAuth server (/api/muse/oauth/*)
        │                                  │
        │  Bearer token (zapier.* scopes,  │
        │  resource-bound)                 ▼
        └──▶ Zapier REST API v1 ──▶ NxtSend data (leads, campaigns,
             /api/integrations/zapier/v1/*    conversations, accounts, usage)
        │
        │  REST Hooks (subscribe/unsubscribe)
        ▼
NxtSend mutations ──▶ outbox ──▶ POST https://hooks.zapier.com/hooks/catch/…
                     (immediate best-effort + daily 06:00 cron retry)
```

## Components

| Component | Location | Role |
|---|---|---|
| OAuth server (shared, extended) | `src/lib/muse-connector/oauth/` | Authorization code, DCR, PKCE-optional-for-confidential, refresh rotation + 10-min Zapier grace, RFC 8707 resource binding, revocation. Additive changes only; the Muse/ChatGPT/Claude surfaces are untouched. |
| Zapier config | `src/lib/integrations/zapier/config.ts` | `ZAPIER_ENABLED` (default on), `ZAPIER_APP_BASE_URL` → `NEXT_PUBLIC_APP_URL` → request origin; `ZAPIER_API_VERSION = "1.0.0"`. Deliberately no OAuth client id/secret vars and no global webhook secret var. |
| REST API logic | `src/lib/integrations/zapier/api.ts` | All v1 endpoint logic (leads, campaigns, conversations, accounts, usage, search, dropdowns, webhooks). |
| Route helpers + auth | `src/lib/integrations/zapier/route-helpers.ts`, `auth.ts` | Bearer token verification, resource + scope tier checks, demo-mode 503, rate limit (120 req/min per token, in-memory). |
| Webhook events | `src/lib/integrations/zapier/events.ts` | The 8 event types + envelope `{id, type, created_at, workspace_id, data}` (stable dedup `id`). |
| Outbox | `src/lib/integrations/zapier/outbox.ts` | `zapier_webhook_subscriptions` + `zapier_webhook_deliveries` (migration 025); subscribe/unsubscribe, enqueue (idempotent on event+subscription), immediate attempt (8s timeout), retry with backoff. |
| Emit path | `src/lib/integrations/zapier/emit.ts`, `client.ts` | Server-side emit from Zapier API mutations + Stripe webhook + dashboard reply route; browser notifier posts dashboard mutations to `POST /api/integrations/zapier/emit` (session-auth). |
| Audit | `src/lib/integrations/zapier/audit.ts` | `zapier.*` audit actions (lead_created, lead_updated, leads_imported, campaign_created/updated/status_changed, leads_enrolled, lead_removed_from_campaign, reply_sent, webhook_subscribed/unsubscribed). OAuth-server events keep `MUSE_OAUTH_*` names. |
| Routes | `src/app/api/integrations/zapier/` | 28 route files: `health`, `emit`, `v1/*` (26). Plus the protected-resource metadata route `src/app/.well-known/oauth-protected-resource/api/integrations/zapier/route.ts` — 29 Zapier route files in total, all present in the production build output. (An earlier brief said 30; the verified count is 29.) |
| Jobs | `src/lib/jobs/` (`zapier_webhook_retry`) | Retries due failed deliveries; runs on the daily 06:00 cron (`vercel.json`: `0 6 * * *` → `/api/jobs/run`). |
| Migrations | `supabase/migrations/025–027` | 025: webhook tables; 026: `code_challenge` nullable; 027: `leads.updated_at` + trigger. |
| CLI app | `integrations/zapier/` | Platform CLI app (plain JS + JSDoc, `zapier-platform-core` 18.6.0, Node ≥ 20). `index.js` wires auth, 13 polling+hidden triggers, 8 instant triggers, 12 creates, 5 searches, 2 search-or-creates. |
| Settings UI | `src/lib/integrations-center/` (registry, status, verify), `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` (ZapierLivePanels) | Registry entry `zapier` (kind `adapter`); status is grant-only "Connected"; detail page has a separate REST panel (not the MCP-specific `ConnectorLivePanels`). |
| Admin | `src/lib/admin/platform-server.ts` (`zapier` health check), `src/app/api/admin/zapier/route.ts`, `src/app/(admin)/admin/integrations/zapier/page.tsx` | Grants by origin (incl. `zapier`), subscriptions, delivery failures, API errors — never tokens/secrets. |

## Data flow — a Zapier API call

1. Zapier presents a Bearer access token issued for resource
   `https://<origin>/api/integrations/zapier`.
2. `auth.ts` verifies the token (hash lookup, expiry, revocation),
   checks the resource binding and the scope tier (`zapier.read`
   for GETs, `zapier.write` for mutations), and re-checks
   `workspace_id` on every read/write.
3. Demo Mode → 503 (`Zapier is not available in Demo Mode…`).
   Unknown token → 401. Insufficient scope → 403 `{error, code}`.
   Rate limit → 429 (120 req/min per token, in-memory, per-process
   — same limitation as the MCP limiter; not a distributed quota).
4. Mutations log a `zapier.*` audit entry and enqueue webhook
   events synchronously (never failing the mutation).

## Data flow — a webhook event

1. A mutation happens (dashboard, Zapier API, Stripe webhook,
   dashboard reply). The emit path builds the envelope and enqueues
   one delivery per active subscription for that event+workspace
   (idempotent on event+subscription).
2. A best-effort immediate attempt is made (8s timeout, HMAC-SHA256
   signed). Success → `delivered`.
3. Failure → stays in the outbox; the `zapier_webhook_retry` job
   retries with 5m → 30m backoff, max 3 attempts, then `dead`
   (dead-letter rows are kept for inspection). The job runs on the
   daily 06:00 cron, so a failed delivery may wait up to ~24h.
4. A 410 from Zapier deactivates the subscription (the Zap is gone).
   Stale subscriptions (inactive > 30 days) are removed by the job.

## Emission coverage (honest)

Emits today: dashboard browser mutations (via decorators → browser
notifier → `/api/integrations/zapier/emit`), Zapier API mutations
(server-side), the Stripe webhook (`subscription.changed`), the
dashboard reply route (`conversation.reply_created`).

Does NOT emit yet: MCP-tool mutations and scheduled-reply sends (no
seam was added to the shared MCP adapter by design).

## What was deliberately NOT built

- `POST /v1/conversations/:id/drafts` — no draft concept exists.
- `GET /v1/dropdowns/templates` — no message-template store exists.
- Anything LinkedIn-send / connection-accept.
- MCP-tool mutations and scheduled-reply sends do not emit webhooks
  yet (no seam was added to the shared MCP adapter by design).

## Files changed (all Zapier work)

Server: `src/lib/muse-connector/oauth/` (additive: scopes, config,
clients, authorize, state, store, tokens, handlers, index),
`src/app/api/muse/oauth/authorize/route.ts` (consent screen),
`src/app/.well-known/oauth-protected-resource/` (Zapier resource
route + root `?resource=` support), `src/lib/integrations/zapier/`,
`src/app/api/integrations/zapier/`, migrations 025–027,
`.env.example` (Zapier section). Additive seams only in
`src/lib/data/leads.ts`, `src/lib/data/webhook-emission.ts`,
`src/lib/inbox/reply.ts`, `src/app/api/inbox/conversations/[id]/reply/route.ts`,
`src/lib/billing/webhook.ts`, `src/app/api/webhooks/stripe/route.ts`,
`src/lib/jobs/`, `src/types/index.ts`.

UI/admin (this work): `src/lib/integrations-center/registry.ts`,
`status.ts`, `verify.ts`, `src/app/api/integrations/status/route.ts`,
`src/app/(dashboard)/dashboard/integrations/[id]/page.tsx`,
`src/components/dashboard/IntegrationCenterBits.tsx`,
`src/lib/muse-connector/grants.ts` (Zapier origin),
`src/lib/admin/platform-server.ts` (Zapier health check),
`src/app/api/admin/zapier/route.ts`,
`src/app/(admin)/admin/integrations/zapier/page.tsx`,
`src/lib/admin/nav.ts`, `.gitignore`. Tests in
`src/lib/integrations-center/__tests__/center.test.ts`,
`src/lib/muse-connector/__tests__/grants.test.ts`,
`src/lib/admin/__tests__/zapier-health.test.ts`.

CLI: `integrations/zapier/` (whole package; `node_modules/` and
`build/` are git-ignored, not committed).
