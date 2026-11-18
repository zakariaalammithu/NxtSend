# Pabbly Connect integration

> Status: **config-ready, not live-verified.** The OAuth scopes, resource URL, REST API v1 routes, webhook subscribe/unsubscribe/subscriptions routes, health endpoint, RFC 9728 metadata route and panel component are implemented and mock-tested. No Pabbly Connect account has connected to a live deployment yet, and nothing here claims a live connection.
>
> Pabbly has no custom-app SDK — there is no Pabbly app to build or submit. The integration is the generic “API by Pabbly” HTTP action + “Webhook by Pabbly” trigger, documented below.

## What this is

NxtSend exposes the same REST API v1 + webhook surface to Pabbly Connect that Zapier and n8n use: one implementation in `src/lib/integrations/rest/`, with thin per-platform route files under `src/app/api/integrations/pabbly/v1/`. The platform is provenance, not privilege — a `pabbly.read` grant authorizes exactly the same tier as a `zapier.read` grant; authorization always goes through the grant's scopes and tiers.

Pabbly Connect has no custom-app SDK and no developer app directory entry to submit. The documented path (verified against Pabbly's own documentation at https://www.pabbly.com/pabbly-connect-documentation-complete-integration-guide/) is: **“API by Pabbly”** (Execute API Request / Custom Request) for every API call, and **“Webhook by Pabbly”** for event triggers. Both use the same v1 API below with an OAuth Bearer token.

## Prerequisites (live deployment)

1. A live Supabase project (not Demo Mode) with migrations **023–031** applied. Migration **031** is the one this platform needs on top of the n8n work: it widens the migration-029 webhook platform CHECK from `('zapier', 'n8n')` to all six REST platforms, or every webhook subscribe fails at insert time.
2. `NEXT_PUBLIC_APP_URL` (or `PABBLY_API_BASE_URL`) set to the deployment's public origin — Pabbly must be able to reach the API, and the OAuth metadata advertises this origin.
3. No Pabbly-specific secret exists on the NxtSend side. The OAuth client is created by Dynamic Client Registration (below); there is no `PABBLY_OAUTH_CLIENT_SECRET` env var.

## Authentication — OAuth 2.0

Pabbly Connect authenticates with NxtSend's shared OAuth 2.1 authorization server (authorization code + PKCE S256, refresh-token rotation).

| Item | Value |
| --- | --- |
| Authorization URL | `https://<your-domain>/api/muse/oauth/authorize` |
| Token URL | `https://<your-domain>/api/muse/oauth/token` |
| Revocation URL | `https://<your-domain>/api/muse/oauth/revoke` |
| Registration URL | `https://<your-domain>/api/muse/oauth/register` (RFC 7591 DCR, one-time) |
| Resource (RFC 8707) | `https://<your-domain>/api/integrations/pabbly` |
| Scopes | `pabbly.read` `pabbly.write` |
| Protected-resource metadata | `https://<your-domain>/.well-known/oauth-protected-resource/api/integrations/pabbly` |

**Scopes.** Only read + write exist — there is no `pabbly.send` tier. `pabbly.read` is the recommended default. A requested scope outside these two is refused with `invalid_scope`, never silently widened. Tiers are independent: `write` does not imply `read`.

**Register the client (one-time DCR call):**

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "NxtSend Pabbly Connect",
    "redirect_uris": ["https://connect.pabbly.com/oauth/callback"],
    "scopes": "pabbly.read pabbly.write",
    "resource": "https://<your-domain>/api/integrations/pabbly"
  }'
```

The response contains `client_id` + `client_secret` — shown once. Store them in Pabbly immediately. (Use the exact redirect URI Pabbly shows for the connection; the example above is a placeholder — the registered URI must match it.)

> **BLOCKED — client registration.** Dynamic Client Registration for the `pabbly` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts` (`OAuthClientPlatform`, `registrationPlatform`, `clientPlatform`, `platformLabel`, redirect-URI allowlist). Until that lands, DCR refuses a `pabbly.*` registration and no token can be issued for the `pabbly` resource — the API surface below is implemented and mock-tested, but no live Pabbly connection can be completed. The scopes (`src/lib/muse-connector/oauth/scopes.ts`), resource URL (`src/lib/muse-connector/oauth/config.ts`) and REST config (`src/lib/integrations/rest/config.ts`) for this platform are already in place.

**Connection test.** After connecting, Pabbly should call `GET /api/integrations/pabbly/v1/auth/test` — it returns the user, workspace and scopes for the token and is the connection check. It never returns token material.

## REST API v1

All paths are under `/api/integrations/pabbly`. Base URL is the deployment origin (e.g. `https://nxtsend.com`). Rate limit: 120 requests/minute per access token (in-memory, per-process). Demo Mode → 503 on every v1 route.

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

## Pabbly Connect setup

There is no app to install. Every workflow is built from Pabbly's generic modules:

### Actions — “API by Pabbly”

1. Add an action step → choose app **API by Pabbly** → Action Event **Execute API Request** (or **Custom Request** for a raw JSON body — required for POSTs with nested objects; plain POST only sends a flat key-value body).
2. Method + Endpoint URL: `https://<your-domain>/api/integrations/pabbly/v1/...` per the table above.
3. Authentication: **Bearer Token**, value = the NxtSend access token (Pabbly adds the `Bearer ` prefix — paste the raw token, not `Bearer <token>`).
4. Payload Type **JSON** for POST/PATCH bodies. Map fields from earlier steps as usual.

### Triggers — “Webhook by Pabbly”

1. Create a workflow → Trigger step → choose **Webhook by Pabbly**. Pabbly generates a unique webhook URL (`https://connect.pabbly.com/workflow/sendwebhookdata/<id>`).
2. Subscribe that URL to the NxtSend event you want: `POST /api/integrations/pabbly/v1/webhooks/subscribe` with `{event, target_url}` and a `pabbly.write` token.
3. In Pabbly, click **Capture Webhook Response** and trigger the event once so Pabbly learns the field shape.

### Polling instead of webhooks

Any read endpoint can be polled: Trigger **Schedule by Pabbly** → action **API by Pabbly** `GET /v1/leads?after=<last run>` (or `/v1/conversations`, `/v1/campaigns`). Pabbly counts only action steps as tasks; triggers and internal steps (Filter, Router, formatters) are free — the webhook + API-call shape above is the cheapest way to run NxtSend automations on Pabbly.

### Example workflows

- **New lead → Google Sheet row:** Webhook by Pabbly (`lead.created`) → Google Sheets “Add New Row”, mapping `data.email`, `data.first_name`, `data.last_name`, `data.company`.
- **New reply → Slack alert:** Webhook by Pabbly (`conversation.reply_created`) → Slack “Send Channel Message”.
- **Nightly usage digest:** Schedule by Pabbly (daily) → API by Pabbly `GET /v1/usage` → Gmail “Send Email”.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PABBLY_ENABLED` | Enables/disables the Pabbly REST surface (OAuth routes stay available). | on (unset = on) |
| `PABBLY_API_BASE_URL` | Public origin advertised in metadata (overrides `NEXT_PUBLIC_APP_URL`). | unset → `NEXT_PUBLIC_APP_URL` → request origin |
| `NEXT_PUBLIC_APP_URL` | Fallback public origin. | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live data + token store (required; Demo Mode refuses). | — |

## Config-ready vs pending

| Item | State |
| --- | --- |
| Scopes `pabbly.read` / `pabbly.write` + tier map + consent descriptions | Config-ready (mock-tested) |
| Resource URL `https://<origin>/api/integrations/pabbly` + `resourcePlatform()` | Config-ready (mock-tested) |
| REST API v1 routes (leads, campaigns, sequences, follow-ups, conversations, accounts, usage, searches, dropdowns) | Config-ready (mock-tested) |
| Webhook subscribe / unsubscribe / subscriptions (v1) + session subscriptions route | Config-ready (mock-tested) |
| Health endpoint `GET /api/integrations/pabbly/health` | Config-ready (mock-tested) |
| RFC 9728 protected-resource metadata route | Config-ready (mock-tested) |
| Migration 031 (webhook platform CHECK) | Written, not applied |
| OAuth client registration (DCR) for `pabbly` | **Blocked** — needs `src/lib/muse-connector/oauth/clients.ts` extension (coordinator) |
| Live Pabbly connection (grant + API call + webhook delivery) | **Credentials required** — needs the DCR block cleared, migrations 023–031 applied, and a real Pabbly account |
| Pabbly app / listing | **Not applicable** — no custom-app SDK exists; nothing to submit |
| Panel component `src/components/integrations/pabbly/PabblyPanel.tsx` | Written, not wired into any page (coordinator wires it) |

## What this API never does

- **No LinkedIn sending.** No LinkedIn-send/accept action, trigger or event exists anywhere in this API — there is no LinkedIn provider. Email inbox replies (write tier) are the only send.
- **No campaign launch.** Campaigns are created DRAFT ONLY. Launch validation lives in the dashboard wizard; there is no launch endpoint for any platform.
- **No message-draft endpoint.** Drafts are created in the dashboard / Co-pilot, not via the API.
- **No date-range report.** `GET /v1/usage` is all-time only; the date-range report is 501 by design.
- **Demo Mode refuses everything.** Every v1 route answers 503 in Demo Mode — demo data is never shared with an automation platform.

## Panel

`src/components/integrations/pabbly/PabblyPanel.tsx` mirrors the Zapier/n8n live panels: health, endpoints, scopes, grants (with revoke), webhook subscriptions + recent deliveries, activity, connect steps, and the trigger/action/search inventory. It is not wired into the integrations detail page — the coordinator wires it. It never shows "Connected" without a real grant.
