# Albato integration

> Status: **config-ready, not live-verified.** The OAuth scopes, resource URL, REST API v1 routes, webhook subscribe/unsubscribe/subscriptions routes, health endpoint, RFC 9728 metadata route and panel component are implemented and mock-tested. No Albato account has connected to a live deployment yet, no app has been built in Albato's App Integrator, and nothing here claims a live connection.
>
> Albato path: the App Integrator builder (OAuth 2.0 authorization + triggers/actions mapped to the v1 API) and/or Albato's generic Webhook app. The builder is web-only — there is no downloadable manifest.

## What this is

NxtSend exposes the same REST API v1 + webhook surface to Albato that Zapier and n8n use: one implementation in `src/lib/integrations/rest/`, with thin per-platform route files under `src/app/api/integrations/albato/v1/`. The platform is provenance, not privilege — an `albato.read` grant authorizes exactly the same tier as a `zapier.read` grant; authorization always goes through the grant's scopes and tiers.

Albato offers an **App Integrator** — a web builder that adds an app to Albato from a public API (see https://albato.com/en/wiki/articles/app-integrator-introduction): create the app, configure an Authorization (OAuth 2.0 / access token), then create triggers and actions by copy-pasting the API request (URL, method, variables). There is no SDK and no downloadable manifest — the builder spec below is the artifact. Albato also has a generic **Webhook** app (“Incoming webhook” trigger) for the no-custom-app path.

## Prerequisites (live deployment)

1. A live Supabase project (not Demo Mode) with migrations **023–031** applied. Migration **031** is the one this platform needs on top of the n8n work: it widens the migration-029 webhook platform CHECK from `('zapier', 'n8n')` to all six REST platforms, or every webhook subscribe fails at insert time.
2. `NEXT_PUBLIC_APP_URL` (or `ALBATO_API_BASE_URL`) set to the deployment's public origin — Albato must be able to reach the API, and the OAuth metadata advertises this origin.
3. No Albato-specific secret exists on the NxtSend side. The OAuth client is created by Dynamic Client Registration (below); there is no `ALBATO_OAUTH_CLIENT_SECRET` env var.

## Authentication — OAuth 2.0

Albato authenticates with NxtSend's shared OAuth 2.1 authorization server (authorization code + PKCE S256, refresh-token rotation).

| Item | Value |
| --- | --- |
| Authorization URL | `https://<your-domain>/api/muse/oauth/authorize` |
| Token URL | `https://<your-domain>/api/muse/oauth/token` |
| Revocation URL | `https://<your-domain>/api/muse/oauth/revoke` |
| Registration URL | `https://<your-domain>/api/muse/oauth/register` (RFC 7591 DCR, one-time) |
| Resource (RFC 8707) | `https://<your-domain>/api/integrations/albato` |
| Scopes | `albato.read` `albato.write` |
| Protected-resource metadata | `https://<your-domain>/.well-known/oauth-protected-resource/api/integrations/albato` |

**Scopes.** Only read + write exist — there is no `albato.send` tier. `albato.read` is the recommended default. A requested scope outside these two is refused with `invalid_scope`, never silently widened. Tiers are independent: `write` does not imply `read`.

**Register the client (one-time DCR call):**

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "NxtSend Albato",
    "redirect_uris": ["https://albato.com/oauth/callback"],
    "scopes": "albato.read albato.write",
    "resource": "https://<your-domain>/api/integrations/albato"
  }'
```

The response contains `client_id` + `client_secret` — shown once. Store them in Albato immediately. (Use the exact redirect URI Albato shows for the connection; the example above is a placeholder — the registered URI must match it.)

> **BLOCKED — client registration.** Dynamic Client Registration for the `albato` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts` (`OAuthClientPlatform`, `registrationPlatform`, `clientPlatform`, `platformLabel`, redirect-URI allowlist). Until that lands, DCR refuses an `albato.*` registration and no token can be issued for the `albato` resource — the API surface below is implemented and mock-tested, but no live Albato connection can be completed. The scopes (`src/lib/muse-connector/oauth/scopes.ts`), resource URL (`src/lib/muse-connector/oauth/config.ts`) and REST config (`src/lib/integrations/rest/config.ts`) for this platform are already in place.

**Connection test.** After connecting, Albato should call `GET /api/integrations/albato/v1/auth/test` — it returns the user, workspace and scopes for the token and is the connection check. It never returns token material.

## REST API v1

All paths are under `/api/integrations/albato`. Base URL is the deployment origin (e.g. `https://nxtsend.com`). Rate limit: 120 requests/minute per access token (in-memory, per-process). Demo Mode → 503 on every v1 route.

| Method & path | Tier | What it does |
| --- | --- | --- |
| `GET /v1/auth/test` | read | Connection check — returns user, workspace, scopes. Never token values. |
| `GET /v1/leads` | read | Polling list, newest first, `after` cursor, `limit` 1–100. |
| `POST /v1/leads` | write | Create (dedups by email, returns `{lead, duplicate}`). |
| `GET /v1/leads/:id` | read | One lead. |
| `PATCH /v1/leads/:id` | write | Update incl. status (emits `lead.updated`). |
| `DELETE /v1/leads/:id` | write | Permanently delete. (Exposed on the n8n-style platforms; Zapier does not expose it.) |
| `POST /v1/leads/import` | write | Bulk import. |
| `GET /v1/campaigns` | read | Polling list. |
| `POST /v1/campaigns` | write | Create — DRAFT ONLY. No launch endpoint exists. |
| `GET /v1/campaigns/:id` | read | One campaign. |
| `PATCH /v1/campaigns/:id` | write | Update a draft. |
| `POST /v1/campaigns/:id/pause\|resume\|stop\|archive` | write | Lifecycle transitions (pause needs active, resume needs paused, stop/archive refuse archived). |
| `GET /v1/campaigns/:id/performance` | read | Stats. `accepted` is always null — no data source exists for it. |
| `GET /v1/campaigns/:id/sequence` | read | Campaign steps. |
| `PUT /v1/campaigns/:id/steps` | write | Replace campaign steps. |
| `GET /v1/campaigns/:id/execution-status` | read | Sequence execution status. |
| `POST /v1/campaigns/:id/leads` | write | Enroll leads (emits `lead.added_to_campaign`). |
| `DELETE /v1/campaigns/:id/leads/:leadId` | write | Remove a lead (emits `lead.removed_from_campaign`). |
| `GET /v1/campaigns/:id/follow-ups` | read | Scheduled follow-up replies. |
| `POST /v1/campaigns/:id/follow-ups` | write | Schedule a follow-up reply. |
| `DELETE /v1/campaigns/:id/follow-ups/:followUpId` | write | Cancel a scheduled follow-up. |
| `GET /v1/conversations` | read | Polling list (incl. `conversation.created` source). |
| `GET /v1/conversations/:id` | read | One conversation. |
| `POST /v1/conversations/:id/replies` | write | Send inbox reply — email channel only; LinkedIn refused 422; `idempotencyKey` required. |
| `GET /v1/accounts` | read | Connected accounts. |
| `GET /v1/accounts/:id` | read | One account. |
| `GET /v1/accounts/:id/status` | read | Account connection status. |
| `GET /v1/usage` | read | Workspace usage + plan. |
| `GET /v1/search/leads\|campaigns\|conversations\|accounts` | read | Search endpoints. |
| `GET /v1/dropdowns/accounts\|campaigns\|lead-statuses\|sequences` | read | Dropdown option lists. |
| `POST /v1/webhooks/subscribe` | write | Subscribe `{event, target_url}` — returns `{id, event, target_url}`; the per-subscription HMAC secret is server-side only and never returned. |
| `POST /v1/webhooks/unsubscribe` | write | Unsubscribe by subscription id. |
| `GET /v1/webhooks/subscriptions` | read | Active subscriptions for the workspace (secrets never included). |

## Webhooks

Eight real events, all emitted from the same outbox as Zapier/n8n (migration 025 tables, platform discriminator widened by migration 031):

| Event | When it fires |
| --- | --- |
| `lead.created` | A lead is created. |
| `lead.updated` | A lead is updated. |
| `lead.added_to_campaign` | A lead is enrolled in a campaign. |
| `lead.removed_from_campaign` | A lead is removed from a campaign. |
| `campaign.created` | A campaign is created. |
| `campaign.status_changed` | A campaign changes status. |
| `conversation.reply_created` | An inbox reply is created. |
| `subscription.changed` | A subscription changes. |

`conversation.created` exists as a polling source only (`GET /v1/conversations`) — there is no webhook event for it.

Delivery: each subscription gets a server-generated HMAC secret; every delivery is signed (verify the signature before trusting the payload) and retried on failure by the cron retry worker. The target URL must be a public https URL (http loopback only on a local deployment); Zapier hook hosts are refused for non-Zapier platforms, and localhost/private IPs are refused in production. Subscriptions are workspace-scoped and listed per platform.

## Albato setup — App Integrator builder spec

Build the NxtSend app in Albato (Apps → App Integrator). There is no file to upload — configure each entity in the builder, copy-pasting from this spec:

### 1. App

- Name: **NxtSend**. Description: lead + campaign automation for NxtSend workspaces.

### 2. Authorization (OAuth 2.0)

- Type: OAuth 2.0.
- Authorization URL: `https://<your-domain>/api/muse/oauth/authorize`
- Token URL: `https://<your-domain>/api/muse/oauth/token`
- Client ID / Client Secret: from the DCR call above.
- Scopes: `albato.read albato.write`
- Access-token template for API requests: `Authorization: Bearer {access_token}`.
- Test request: `GET https://<your-domain>/api/integrations/albato/v1/auth/test` (must return 200 with the workspace).

### 3. Triggers

| Trigger | Type | API request |
| --- | --- | --- |
| New lead | Webhook | Subscribe `POST /v1/webhooks/subscribe {event: "lead.created", target_url: <albato webhook catcher URL>}` |
| Lead updated | Webhook | Same, `event: "lead.updated"` |
| Lead added to campaign | Webhook | Same, `event: "lead.added_to_campaign"` |
| Lead removed from campaign | Webhook | Same, `event: "lead.removed_from_campaign"` |
| Campaign created | Webhook | Same, `event: "campaign.created"` |
| Campaign status changed | Webhook | Same, `event: "campaign.status_changed"` |
| New inbox reply | Webhook | Same, `event: "conversation.reply_created"` |
| Subscription changed | Webhook | Same, `event: "subscription.changed"` |
| New conversation | API (polling) | `GET /v1/conversations?after={{last_poll}}` on a schedule |

Webhook triggers use Albato's **webhook catcher** entity: Albato generates the catcher URL; paste it as `target_url` when subscribing. Unsubscribe when the automation is disabled.

### 4. Actions (one per row — method + URL + body)

| Action | Request |
| --- | --- |
| Create lead | `POST /v1/leads` — body: `{email, first_name, last_name, company, …}` |
| Update lead | `PATCH /v1/leads/{id}` — body: changed fields |
| Delete lead | `DELETE /v1/leads/{id}` |
| Import leads | `POST /v1/leads/import` — body: `{leads: [...]}` |
| Create campaign (draft) | `POST /v1/campaigns` — body: campaign draft fields |
| Update campaign | `PATCH /v1/campaigns/{id}` |
| Pause / resume / stop / archive campaign | `POST /v1/campaigns/{id}/{action}` |
| Add leads to campaign | `POST /v1/campaigns/{id}/leads` |
| Remove lead from campaign | `DELETE /v1/campaigns/{id}/leads/{leadId}` |
| Replace campaign steps | `PUT /v1/campaigns/{id}/steps` |
| Schedule follow-up reply | `POST /v1/campaigns/{id}/follow-ups` |
| Cancel scheduled follow-up | `DELETE /v1/campaigns/{id}/follow-ups/{followUpId}` |
| Send inbox reply (email only) | `POST /v1/conversations/{id}/replies` — body includes `idempotencyKey` |
| Get campaign performance | `GET /v1/campaigns/{id}/performance` |
| Get usage | `GET /v1/usage` |
| Search leads / campaigns / conversations / accounts | `GET /v1/search/<resource>?q=…` |
| Custom API request | Any `GET/POST/PATCH/PUT/DELETE` on `/v1/...` (relative path) |

Dynamic lists (dropdowns): campaigns → `GET /v1/dropdowns/campaigns`, accounts → `GET /v1/dropdowns/accounts`, lead statuses → `GET /v1/dropdowns/lead-statuses` (static), sequences → `GET /v1/dropdowns/sequences`.

**The app is NOT submitted to Albato** — building it in the App Integrator makes it available in your Albato account; listing it in Albato's public catalog is a separate step the owner must do.

### No-custom-app path

Use Albato's generic **Webhook** app (“Incoming webhook” trigger — Albato generates a URL; subscribe it via `POST /v1/webhooks/subscribe`) and the generic HTTP action for API calls, with `Authorization: Bearer <token>`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ALBATO_ENABLED` | Enables/disables the Albato REST surface (OAuth routes stay available). | on (unset = on) |
| `ALBATO_API_BASE_URL` | Public origin advertised in metadata (overrides `NEXT_PUBLIC_APP_URL`). | unset → `NEXT_PUBLIC_APP_URL` → request origin |
| `NEXT_PUBLIC_APP_URL` | Fallback public origin. | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live data + token store (required; Demo Mode refuses). | — |

## Config-ready vs pending

| Item | State |
| --- | --- |
| Scopes `albato.read` / `albato.write` + tier map + consent descriptions | Config-ready (mock-tested) |
| Resource URL `https://<origin>/api/integrations/albato` + `resourcePlatform()` | Config-ready (mock-tested) |
| REST API v1 routes (leads, campaigns, sequences, follow-ups, conversations, accounts, usage, searches, dropdowns) | Config-ready (mock-tested) |
| Webhook subscribe / unsubscribe / subscriptions (v1) + session subscriptions route | Config-ready (mock-tested) |
| Health endpoint `GET /api/integrations/albato/health` | Config-ready (mock-tested) |
| RFC 9728 protected-resource metadata route | Config-ready (mock-tested) |
| Migration 031 (webhook platform CHECK) | Written, not applied |
| OAuth client registration (DCR) for `albato` | **Blocked** — needs `src/lib/muse-connector/oauth/clients.ts` extension (coordinator) |
| Live Albato connection (grant + API call + webhook delivery) | **Credentials required** — needs the DCR block cleared, migrations 023–031 applied, and a real Albato account |
| Albato App Integrator app | **Not built** — builder spec above; the builder is web-only, no downloadable manifest exists |
| Panel component `src/components/integrations/albato/AlbatoPanel.tsx` | Written, not wired into any page (coordinator wires it) |

## What this API never does

- **No LinkedIn sending.** No LinkedIn-send/accept action, trigger or event exists anywhere in this API — there is no LinkedIn provider. Email inbox replies (write tier) are the only send.
- **No campaign launch.** Campaigns are created DRAFT ONLY. Launch validation lives in the dashboard wizard; there is no launch endpoint for any platform.
- **No message-draft endpoint.** Drafts are created in the dashboard / Co-pilot, not via the API.
- **No date-range report.** `GET /v1/usage` is all-time only; the date-range report is 501 by design.
- **Demo Mode refuses everything.** Every v1 route answers 503 in Demo Mode — demo data is never shared with an automation platform.

## Panel

`src/components/integrations/albato/AlbatoPanel.tsx` mirrors the Zapier/n8n live panels: health, endpoints, scopes, grants (with revoke), webhook subscriptions + recent deliveries, activity, connect steps, and the trigger/action/search inventory. It is not wired into the integrations detail page — the coordinator wires it. It never shows "Connected" without a real grant.
