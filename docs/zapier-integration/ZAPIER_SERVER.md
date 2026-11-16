# Zapier Integration — Server Side

NxtSend is the **server** in this integration: Zapier calls **into**
NxtSend (REST API + REST Hook webhooks) on behalf of a signed-in
NxtSend user. The CLI package in `integrations/zapier/` (built by a
parallel agent) is the client; this document covers the server only.

Status: implemented, unit-tested, **not yet verified live** (no live
Supabase project, no Zapier developer account was used from this
environment). Nothing here has been submitted to Zapier.

## What exists

| Piece | Location |
|---|---|
| OAuth 2.0 extension (scopes, Zapier resource, redirect pattern, PKCE-optional for confidential clients, refresh grace) | `src/lib/muse-connector/oauth/` (shared server, additive) |
| Zapier REST API v1 | `src/app/api/integrations/zapier/v1/*`, logic in `src/lib/integrations/zapier/api.ts` |
| Health (public) | `GET /api/integrations/zapier/health` → `{mode, zapierEnabled, version: "1.0.0"}` |
| REST Hook subscriptions + delivery outbox | `src/lib/integrations/zapier/outbox.ts`, migration `025` |
| Server-side emit path | `src/lib/integrations/zapier/emit.ts` + browser notifier `client.ts` + `POST /api/integrations/zapier/emit` |
| Job | `zapier_webhook_retry` in `src/lib/jobs/` (runs on the daily 06:00 cron) |
| Migrations | `025_zapier_webhooks.sql`, `026_oauth_pkce_optional.sql`, `027_leads_updated_at.sql` |
| Config | `ZAPIER_ENABLED`, `ZAPIER_APP_BASE_URL` (`.env.example`) |

## Owner setup (one-time)

Apply migrations 025–027 in the Supabase SQL Editor, then register
the Zapier client. There are **no hardcoded credentials and no env
client vars**: the owner obtains `client_id` / `client_secret` by a
one-time Dynamic Client Registration call. Copy the **OAuth Redirect
URL** from the Zapier developer dashboard first (it looks like
`https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/`
— the App ID is assigned at registration and **may change after
publish/beta**, in which case re-register with the new URL), then:

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Zapier",
    "redirect_uris": ["https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/"],
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

The response contains `client_id` and `client_secret` (**shown once
— store it in the Zapier developer dashboard immediately**). Enter
both in Zapier, with:

- Authorization URL: `https://<your-domain>/api/muse/oauth/authorize`
- Token URL: `https://<your-domain>/api/muse/oauth/token`
- Scopes: `zapier.read zapier.write` (or `zapier.read` for read-only Zaps)
- Resource (RFC 8707): `https://<your-domain>/api/integrations/zapier`

## OAuth decisions

- **Scopes:** `zapier.read` + `zapier.write` only. There is no
  `zapier.send` tier: Zapier never sends LinkedIn messages (no
  provider exists), and email inbox replies sent through the Zapier
  API are covered by the write tier, documented as such.
- **Redirect URIs:** pattern-validated, not hardcoded — host must be
  `zapier.com`, path must match
  `/dashboard/auth/oauth/return/App<digits>CLIAPI/` (trailing slash
  tolerated). Threaded through `isAllowedOAuthRedirectUri`,
  per-platform checks, `clientPlatform` and DCR error strings.
- **PKCE optional for confidential clients only.** Zapier's standard
  OAuth2 client sends no PKCE (its canonical CLI example has no
  `code_challenge` field), so requiring PKCE would make the
  integration unusable. A confidential client authenticates the code
  exchange with its `client_secret` — the same authentication OAuth
  2.0 relied on before PKCE — and the code is still single-use,
  10-minute, redirect-bound and audience-bound. **Public clients
  still require PKCE S256**; a stored challenge must still be
  satisfied by a matching verifier. Migration 026 relaxes
  `muse_oauth_codes.code_challenge` to nullable (non-destructive).
- **Refresh rotation + Zapier grace.** Zapier may re-present a
  refresh token it already rotated (its auto-refresh can race a
  retry). Without a grace window that looks like token theft and
  revokes the whole grant, breaking the connection on a routine
  retry. So: a Zapier grant re-presenting an already-rotated refresh
  token **within 10 minutes of the rotation** rotates again from the
  live successor instead of revoking. Outside the window, or for
  Muse/ChatGPT/Claude grants, reuse still revokes the grant.
  Tradeoff, stated plainly: inside the window a stolen Zapier
  refresh token could also be exchanged once more instead of
  triggering revocation. The window is short, the token is still
  single-use per rotation step — accepted because the alternative
  breaks Zapier connections in normal use.
- **Resource binding:** the Zapier resource is
  `https://<origin>/api/integrations/zapier`, validated byte-for-byte
  like the MCP resources. A token issued for it never verifies for
  `/api/mcp*` and vice versa. Protected-resource metadata:
  `/.well-known/oauth-protected-resource/api/integrations/zapier`
  (and `?resource=` on the root document).
- **Audit:** Zapier API mutations log `zapier.*` actions
  (`src/lib/integrations/zapier/audit.ts`). OAuth-server-level events
  keep their `MUSE_OAUTH_*` names — they describe the shared
  authorization server, not the calling platform.

## REST API v1

Base `/api/integrations/zapier/v1/*`. Auth on every route: Bearer
access token for the Zapier resource + `zapier.read` (GETs) /
`zapier.write` (mutations) tier checks. Demo Mode → 503, unknown
token → 401, insufficient scope → 403 `{error, code}`, rate limit
120 req/min per token (in-memory, per-process — same limitation as
the MCP limiter; not a distributed quota). Errors are `{error}` +
`code` where it helps Zapier. Workspace-scoped by the token's grant;
every read/write re-checks `workspace_id`.

| Route | Notes |
|---|---|
| `GET /v1/auth/test` | Connection label: `{user: {id, email}, workspace: {id, name}, scopes}`. Never token values. |
| `GET /v1/leads?limit=&after=&order=` | Newest first; `order` `created_at_desc` (default) or `updated_at_desc`; `after` = exclusive ISO cursor; `limit` default 50, max 100. Stable `id` per item. |
| `GET /v1/leads/:id` | |
| `POST /v1/leads` | Dedups by email → `{lead, duplicate}`. |
| `PATCH /v1/leads/:id` | Incl. status; emits `lead.updated` with `changed_fields`. |
| `POST /v1/leads/import` | Max 100; `{created, skipped, leads}`. |
| `GET /v1/campaigns`, `GET /v1/campaigns/:id` | `:id` includes steps. |
| `POST /v1/campaigns` | **Draft only.** Zapier cannot launch a campaign directly — no server-side wizard launch validation exists to reuse. Launch from the dashboard, then pause/resume from Zapier. |
| `PATCH /v1/campaigns/:id` | Name/type/description; a `status` in the body follows the action transition rules. |
| `POST /v1/campaigns/:id/pause\|resume\|stop\|archive` | `stop` → archived. Pause needs active, resume needs paused, stop/archive refuse already-archived — the MCP adapter's `requiredFrom` rules. |
| `GET /v1/campaigns/:id/performance` | Real stats via `loadCampaignStats`. `accepted` is always `null` — no data source exists; never fabricated. |
| `POST /v1/campaigns/:id/leads` | `{lead_ids}` → `{enrolled, skipped, notFound}`. |
| `DELETE /v1/campaigns/:id/leads/:leadId` | Removes the enrollment; the lead record is kept. |
| `GET /v1/conversations`, `GET /v1/conversations/:id` | Thread = conversation + messages. |
| `POST /v1/conversations/:id/replies` | Existing `sendInboxReply`: email only, LinkedIn refused 422, `idempotencyKey` required, duplicates replayed never re-sent. |
| `GET /v1/accounts` | Connected accounts, read-only. |
| `GET /v1/usage` | Workspace usage + plan. |
| `GET /v1/search/leads?q=&email=&id=`, `campaigns?q=&id=&status=`, `conversations?q=`, `accounts?q=` | Actual matches; empty array when none. |
| `GET /v1/dropdowns/campaigns`, `/accounts`, `/lead-statuses` | |
| `GET /v1/dropdowns/sequences?campaign_id=` | Steps belong to a campaign, so `campaign_id` is required. |
| `POST /v1/webhooks/subscribe`, `POST /v1/webhooks/unsubscribe`, `GET /v1/webhooks/subscriptions` | See below. |

**Deliberately omitted endpoints (not invented):**

- `POST /v1/conversations/:id/drafts` — no draft concept exists in
  the product. Drafting is a UI/AI feature (`draftOutreachMessage`),
  not a stored draft. NOT SUPPORTED.
- `GET /v1/dropdowns/templates` — no message-template store exists
  in the product (prompt snippets are AI-drafting prompts, not
  outreach templates). Omitted, not faked.

## Webhooks (REST Hooks)

- `POST /v1/webhooks/subscribe {event, target_url}` →
  `{id, event, target_url}` (201; a duplicate active subscription
  returns the existing id). `target_url` must be https on
  `hooks.zapier.com` (the real Catch Hook host — verified 2026-11-17
  against Zapier docs/community: REST Hook `targetUrl`s look like
  `https://hooks.zapier.com/hooks/catch/<id>/<token>/`) or
  `zapier.com`. The per-subscription HMAC secret is generated
  server-side and **never returned** — not in the subscribe
  response, not in any list.
- `POST /v1/webhooks/unsubscribe {id}` → 200 (idempotent; unknown
  id → 404). Deactivates, never hard-deletes.
- `GET /v1/webhooks/subscriptions` — active subscriptions for the
  workspace, secrets never included.

**Events emitted** (only where the app genuinely produces them):
`lead.created`, `lead.updated` (any successful update, payload
carries `changed_fields`; powered by migration 027's
`leads.updated_at` trigger), `lead.added_to_campaign`,
`lead.removed_from_campaign`, `campaign.created`,
`campaign.status_changed`, `conversation.reply_created` (after a
terminal `sent`/`simulated` outcome — dashboard reply route,
Zapier reply route; MCP/scheduled-reply sends do not emit yet),
`subscription.changed` (from the Stripe webhook after a successful
subscription mutation).

**Delivery — read this before promising anything to a user:**
outbox pattern. The mutation enqueues (synchronously, never failing
the mutation) and a best-effort **immediate** attempt is made with
an 8s timeout. Failures stay in the outbox for the
`zapier_webhook_retry` job (exponential backoff 5m → 30m, max 3
attempts, then `dead` — dead-letter rows are kept for inspection).
The job runs on the **daily 06:00 cron**, so a failed delivery may
wait **up to ~24h** for its next retry. Do not claim instant
guaranteed delivery. A 410 from Zapier deactivates the subscription
(the Zap is gone). Stale subscriptions (inactive > 30 days) are
removed by the job. Signing reuses the HMAC-SHA256 scheme
(`X-NxtSend-Signature: t=<ts>,v1=<hex>` + `X-NxtSend-Timestamp`,
5-min tolerance) — honest note: Zapier does **not** document
verifying these headers on REST Hook deliveries; the signature is
for receivers that do verify, and for our own delivery-log
integrity.

**Emission coverage:** dashboard browser mutations emit via the
decorators → browser notifier → `POST /api/integrations/zapier/emit`
(session-auth, workspace from the session); Zapier API mutations
emit server-side from the route handlers; the Stripe webhook and
the dashboard reply route emit server-side too. MCP-tool mutations
and scheduled-reply sends do **not** emit yet (no seam was added
to the MCP adapter by design — that adapter is shared by three
platforms and was left untouched).

**NOT SUPPORTED:** anything LinkedIn-send / connection-accept
related (`accepted` is always null; no LinkedIn send exists);
`subscription.changed` is the only billing event (no invoice /
payment events are emitted).

## Demo vs live

- **Demo Mode:** the whole Zapier surface refuses with 503
  (`Zapier is not available in Demo Mode…`). No demo data is ever
  served to Zapier. The health endpoint still answers (it reports
  `mode: "demo"`).
- **Live:** needs Supabase configured + migrations 023–027 applied
  + the DCR-registered Zapier client. No live verification has been
  done from this environment (no live project, no Zapier account):
  the OAuth grant flow inside Zapier, the REST Hook end-to-end
  delivery to a real `hooks.zapier.com` URL, and the cron retry
  tick are all **pending live verification**.

## Files changed (server side)

OAuth (shared, additive): `scopes.ts`, `config.ts`, `clients.ts`,
`authorize.ts`, `state.ts`, `store.ts`, `tokens.ts`,
`handlers.ts`, `index.ts`; consent screen
(`src/app/api/muse/oauth/authorize/route.ts`); well-known metadata
route for the Zapier resource.

Zapier (new): `src/lib/integrations/zapier/` (`config.ts`,
`events.ts`, `outbox.ts`, `emit.ts`, `client.ts`, `auth.ts`,
`audit.ts`, `api.ts`, `route-helpers.ts`, `__tests__/`); routes
under `src/app/api/integrations/zapier/` (health, emit, v1/*);
migrations 025–027; `.env.example` (Zapier section);
`docs/zapier-integration/ZAPIER_SERVER.md` (this file).

Touched (additive seams only): `src/lib/data/leads.ts`
(`updated_at`), `src/lib/data/webhook-emission.ts` (Zapier
notifier + `lead.updated` / enrollment events),
`src/lib/inbox/reply.ts` (optional `onTerminalSent` callback),
`src/app/api/inbox/conversations/[id]/reply/route.ts` (wires it),
`src/lib/billing/webhook.ts` + `src/app/api/webhooks/stripe/route.ts`
(optional `onSubscriptionChanged`), `src/lib/jobs/` (new job
type + handler + context), `src/types/index.ts`
(`Lead.updated_at`).

Untouched by design: all 54 MCP tools and their classifications,
billing logic, admin bootstrap, existing send paths, the generic
one-endpoint webhook system, and `integrations/zapier/` (the CLI
package — owned by the parallel agent).
