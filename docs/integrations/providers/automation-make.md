# Make integration

> Status: **config-ready, not live-verified.** The OAuth scopes, resource URL, REST API v1 routes, webhook subscribe/unsubscribe/subscriptions routes, health endpoint, RFC 9728 metadata route and panel component are implemented and mock-tested. No Make account has connected to a live deployment yet, no custom app has been submitted to Make, and nothing here claims a live connection.
>
> Make path: a custom app (Base + OAuth 2.0 connection + modules) and/or the generic HTTP module. The custom app is a skeleton — it has not been built in Make's web UI / VS Code, and no app has been submitted to Make.

## What this is

NxtSend exposes the same REST API v1 + webhook surface to Make that Zapier and n8n use: one implementation in `src/lib/integrations/rest/`, with thin per-platform route files under `src/app/api/integrations/make/v1/`. The platform is provenance, not privilege — a `make.read` grant authorizes exactly the same tier as a `zapier.read` grant; authorization always goes through the grant's scopes and tiers.

Make scenarios call NxtSend in two ways: (1) a **custom app** built in Make's web UI or VS Code (components: Base, Connections, Modules — JSONC + IML; see https://developers.make.com), or (2) the generic **HTTP > Make a request** module with a Bearer token, plus a **Webhooks > Custom webhook** trigger for events. Both paths use the same v1 API below; the custom app is a nicer UX, the HTTP module needs no review.

## Prerequisites (live deployment)

1. A live Supabase project (not Demo Mode) with migrations **023–031** applied. Migration **031** is the one this platform needs on top of the n8n work: it widens the migration-029 webhook platform CHECK from `('zapier', 'n8n')` to all six REST platforms, or every webhook subscribe fails at insert time.
2. `NEXT_PUBLIC_APP_URL` (or `MAKE_API_BASE_URL`) set to the deployment's public origin — Make must be able to reach the API, and the OAuth metadata advertises this origin.
3. No Make-specific secret exists on the NxtSend side. The OAuth client is created by Dynamic Client Registration (below); there is no `MAKE_OAUTH_CLIENT_SECRET` env var.

## Authentication — OAuth 2.0

Make authenticates with NxtSend's shared OAuth 2.1 authorization server (authorization code + PKCE S256, refresh-token rotation).

| Item | Value |
| --- | --- |
| Authorization URL | `https://<your-domain>/api/muse/oauth/authorize` |
| Token URL | `https://<your-domain>/api/muse/oauth/token` |
| Revocation URL | `https://<your-domain>/api/muse/oauth/revoke` |
| Registration URL | `https://<your-domain>/api/muse/oauth/register` (RFC 7591 DCR, one-time) |
| Resource (RFC 8707) | `https://<your-domain>/api/integrations/make` |
| Scopes | `make.read` `make.write` |
| Protected-resource metadata | `https://<your-domain>/.well-known/oauth-protected-resource/api/integrations/make` |

**Scopes.** Only read + write exist — there is no `make.send` tier. `make.read` is the recommended default. A requested scope outside these two is refused with `invalid_scope`, never silently widened. Tiers are independent: `write` does not imply `read`.

**Register the client (one-time DCR call):**

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "NxtSend Make",
    "redirect_uris": ["https://eu1.make.com/oauth/cb/oauth2"],
    "scopes": "make.read make.write",
    "resource": "https://<your-domain>/api/integrations/make"
  }'
```

The response contains `client_id` + `client_secret` — shown once. Store them in Make immediately. (Use your Make zone's callback host — `eu1.make.com` above is an example; the registered redirect URI must match the one Make shows for the connection.)

> **BLOCKED — client registration.** Dynamic Client Registration for the `make` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts` (`OAuthClientPlatform`, `registrationPlatform`, `clientPlatform`, `platformLabel`, redirect-URI allowlist). Until that lands, DCR refuses a `make.*` registration and no token can be issued for the `make` resource — the API surface below is implemented and mock-tested, but no live Make connection can be completed. The scopes (`src/lib/muse-connector/oauth/scopes.ts`), resource URL (`src/lib/muse-connector/oauth/config.ts`) and REST config (`src/lib/integrations/rest/config.ts`) for this platform are already in place.

**Connection test.** After connecting, Make should call `GET /api/integrations/make/v1/auth/test` — it returns the user, workspace and scopes for the token and is the connection check Make shows as green. It never returns token material.

## REST API v1

All paths are under `/api/integrations/make`. Base URL is the deployment origin (e.g. `https://nxtsend.com`). Rate limit: 120 requests/minute per access token (in-memory, per-process). Demo Mode → 503 on every v1 route.

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

## Make setup

### Option A — custom app (recommended UX)

The skeleton lives in `integrations/make/`:

- `app.json` — app manifest skeleton (label, description, docs URL, base URL, connection + module inventory). Marked as a skeleton: the authoritative build happens in Make's web UI or VS Code — Make custom apps are component directories (Base / Connections / Modules), not a single file Make imports. Use the skeleton as the spec to build from.
- `base.json` — Base component: base URL `https://<your-domain>/api/integrations/make/v1`, shared auth header, error mapping.
- `connections/oauth2.json` — OAuth 2.0 connection: authorize/token URLs, scopes `make.read make.write`, resource `https://<your-domain>/api/integrations/make`. Validation call: `GET /v1/auth/test`.
- `modules/` — one JSONC file per module (actions, searches, polling triggers), each mapping to a v1 endpoint in the table above.
- `scenarios/` — importable scenario blueprints (see below).

Build it in Make (Custom Apps → create from the skeleton), register the OAuth client first (see Authentication), then test one module in a scenario. **The app is NOT submitted to Make** — submission and review are a separate step the owner must do.

### Option B — generic HTTP module (no custom app)

Add **HTTP > Make a request**, set URL to `https://<your-domain>/api/integrations/make/v1/...`, method per the table, and Credentials → OAuth 2.0 (same authorize/token URLs and scopes) or an API-key-style Bearer header with the access token. For events, add **Webhooks > Custom webhook** as the trigger and subscribe its URL via `POST /v1/webhooks/subscribe`.

### Scenario blueprints

`integrations/make/scenarios/` holds importable blueprint JSON in Make's documented blueprint shape (`{name, flow: [{id, module, version, parameters, mapper, metadata}], metadata}`, `http:ActionSendData` v3 for API calls, `gateway:CustomWebHook` for the trigger; connections are `null` in blueprints by design):

- `new-lead-to-crm.json` — NxtSend `lead.created` webhook → create/update the lead in your CRM (HTTP POST to the CRM) — template; replace the CRM step with your system.
- `poll-new-leads-to-sheet.json` — scheduled poll of `GET /v1/leads` → Iterator → Google Sheets row per lead.

Import: Make → Scenarios → ⋮ → Import blueprint, pick the file, then create the connections (Make webhook, HTTP OAuth) and replace the `<your-domain>` / placeholder values. **The blueprints were constructed from the documented blueprint shape and were NOT imported into a live Make account — treat the first import as a test.** No secrets are in the files (tokens and keys are placeholders you replace).

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `MAKE_ENABLED` | Enables/disables the Make REST surface (OAuth routes stay available). | on (unset = on) |
| `MAKE_API_BASE_URL` | Public origin advertised in metadata (overrides `NEXT_PUBLIC_APP_URL`). | unset → `NEXT_PUBLIC_APP_URL` → request origin |
| `NEXT_PUBLIC_APP_URL` | Fallback public origin. | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live data + token store (required; Demo Mode refuses). | — |

## Config-ready vs pending

| Item | State |
| --- | --- |
| Scopes `make.read` / `make.write` + tier map + consent descriptions | Config-ready (mock-tested) |
| Resource URL `https://<origin>/api/integrations/make` + `resourcePlatform()` | Config-ready (mock-tested) |
| REST API v1 routes (leads, campaigns, sequences, follow-ups, conversations, accounts, usage, searches, dropdowns) | Config-ready (mock-tested) |
| Webhook subscribe / unsubscribe / subscriptions (v1) + session subscriptions route | Config-ready (mock-tested) |
| Health endpoint `GET /api/integrations/make/health` | Config-ready (mock-tested) |
| RFC 9728 protected-resource metadata route | Config-ready (mock-tested) |
| Migration 031 (webhook platform CHECK) | Written, not applied |
| OAuth client registration (DCR) for `make` | **Blocked** — needs `src/lib/muse-connector/oauth/clients.ts` extension (coordinator) |
| Live Make connection (grant + API call + webhook delivery) | **Credentials required** — needs the DCR block cleared, migrations 023–031 applied, and a real Make account |
| Make custom app (Base + connection + modules) | **Not submitted** — skeleton only, needs building in Make's web UI / VS Code + a Make account |
| Scenario blueprints | Written, not imported into a live Make account |
| Panel component `src/components/integrations/make/MakePanel.tsx` | Written, not wired into any page (coordinator wires it) |

## What this API never does

- **No LinkedIn sending.** No LinkedIn-send/accept action, trigger or event exists anywhere in this API — there is no LinkedIn provider. Email inbox replies (write tier) are the only send.
- **No campaign launch.** Campaigns are created DRAFT ONLY. Launch validation lives in the dashboard wizard; there is no launch endpoint for any platform.
- **No message-draft endpoint.** Drafts are created in the dashboard / Co-pilot, not via the API.
- **No date-range report.** `GET /v1/usage` is all-time only; the date-range report is 501 by design.
- **Demo Mode refuses everything.** Every v1 route answers 503 in Demo Mode — demo data is never shared with an automation platform.

## Panel

`src/components/integrations/make/MakePanel.tsx` mirrors the Zapier/n8n live panels: health, endpoints, scopes, grants (with revoke), webhook subscriptions + recent deliveries, activity, connect steps, and the trigger/action/search inventory. It is not wired into the integrations detail page — the coordinator wires it. It never shows "Connected" without a real grant.
