# Activepieces integration

> Status: **config-ready, not live-verified.** The OAuth scopes, resource URL, REST API v1 routes, webhook subscribe/unsubscribe/subscriptions routes, health endpoint, RFC 9728 metadata route and panel component are implemented and mock-tested. No Activepieces instance has connected to a live deployment yet, the piece has not been built or submitted, and nothing here claims a live connection.
>
> Activepieces path: a TypeScript piece (`@activepieces/pieces-framework`, OAuth 2.0 auth) in `integrations/activepieces/`. The piece is **build-verified** (tsc clean + runtime construct against framework 0.32.0, 17 actions, 9 triggers, 2026-11-19) — it has NOT been installed in any Activepieces instance or submitted.

## What this is

NxtSend exposes the same REST API v1 + webhook surface to Activepieces that Zapier and n8n use: one implementation in `src/lib/integrations/rest/`, with thin per-platform route files under `src/app/api/integrations/activepieces/v1/`. The platform is provenance, not privilege — an `activepieces.read` grant authorizes exactly the same tier as a `zapier.read` grant; authorization always goes through the grant's scopes and tiers.

Activepieces pieces are TypeScript npm packages built with `@activepieces/pieces-framework` (`createPiece` + `PieceAuth` + `createAction` + `createTrigger`; see https://www.activepieces.com/docs/build-pieces/building-pieces/start-building and https://www.activepieces.com/docs/build-pieces/piece-reference/authentication). The piece in `integrations/activepieces/` follows that structure: OAuth 2.0 auth against NxtSend's shared authorization server, one action per v1 write endpoint, one trigger per webhook event (plus polling triggers for the polling-only sources).

## Prerequisites (live deployment)

1. A live Supabase project (not Demo Mode) with migrations **023–031** applied. Migration **031** is the one this platform needs on top of the n8n work: it widens the migration-029 webhook platform CHECK from `('zapier', 'n8n')` to all six REST platforms, or every webhook subscribe fails at insert time.
2. `NEXT_PUBLIC_APP_URL` (or `ACTIVEPIECES_API_BASE_URL`) set to the deployment's public origin — Activepieces must be able to reach the API, and the OAuth metadata advertises this origin.
3. No Activepieces-specific secret exists on the NxtSend side. The OAuth client is created by Dynamic Client Registration (below); there is no `ACTIVEPIECES_OAUTH_CLIENT_SECRET` env var.

## Authentication — OAuth 2.0

Activepieces authenticates with NxtSend's shared OAuth 2.1 authorization server (authorization code + PKCE S256, refresh-token rotation).

| Item | Value |
| --- | --- |
| Authorization URL | `https://<your-domain>/api/muse/oauth/authorize` |
| Token URL | `https://<your-domain>/api/muse/oauth/token` |
| Revocation URL | `https://<your-domain>/api/muse/oauth/revoke` |
| Registration URL | `https://<your-domain>/api/muse/oauth/register` (RFC 7591 DCR, one-time) |
| Resource (RFC 8707) | `https://<your-domain>/api/integrations/activepieces` |
| Scopes | `activepieces.read` `activepieces.write` |
| Protected-resource metadata | `https://<your-domain>/.well-known/oauth-protected-resource/api/integrations/activepieces` |

**Scopes.** Only read + write exist — there is no `activepieces.send` tier. `activepieces.read` is the recommended default. A requested scope outside these two is refused with `invalid_scope`, never silently widened. Tiers are independent: `write` does not imply `read`.

**Register the client (one-time DCR call):**

```bash
curl -X POST https://<your-domain>/api/muse/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "NxtSend Activepieces",
    "redirect_uris": ["https://cloud.activepieces.com/api/v1/authn/oauth2/callback"],
    "scopes": "activepieces.read activepieces.write",
    "resource": "https://<your-domain>/api/integrations/activepieces"
  }'
```

The response contains `client_id` + `client_secret` — shown once. Store them in Activepieces immediately. (Use the exact redirect URI your Activepieces instance shows for the connection; the example above is Activepieces Cloud's callback — a self-hosted instance has its own origin. The registered URI must match it.)

> **BLOCKED — client registration.** Dynamic Client Registration for the `activepieces` platform is pending the coordinator extending `src/lib/muse-connector/oauth/clients.ts` (`OAuthClientPlatform`, `registrationPlatform`, `clientPlatform`, `platformLabel`, redirect-URI allowlist). Until that lands, DCR refuses an `activepieces.*` registration and no token can be issued for the `activepieces` resource — the API surface below is implemented and mock-tested, but no live Activepieces connection can be completed. The scopes (`src/lib/muse-connector/oauth/scopes.ts`), resource URL (`src/lib/muse-connector/oauth/config.ts`) and REST config (`src/lib/integrations/rest/config.ts`) for this platform are already in place.

**Connection test.** After connecting, the piece should call `GET /api/integrations/activepieces/v1/auth/test` — it returns the user, workspace and scopes for the token and is the connection check. It never returns token material.

## REST API v1

All paths are under `/api/integrations/activepieces`. Base URL is the deployment origin (e.g. `https://nxtsend.com`). Rate limit: 120 requests/minute per access token (in-memory, per-process). Demo Mode → 503 on every v1 route.

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

## Activepieces setup — the piece

The piece lives in `integrations/activepieces/`:

- `package.json` — package `@nxtsend/piece-nxtsend` v0.1.0, framework dependency `@activepieces/pieces-framework` (version pinned in the file — verify it resolves before building).
- `src/index.ts` — `createPiece({ displayName: "NxtSend", auth, actions, triggers })`.
- `src/auth.ts` — `PieceAuth.OAuth2({ authUrl, tokenUrl, scope: ["activepieces.read", "activepieces.write"], pkce: true, pkceMethod: "S256" })`. (No `getConnectionIdentifier`: the framework 0.32.0 types have no such property, despite the auth docs describing one — the connection label is Activepieces' default.)
- `src/lib/actions/*.ts` — one `createAction` per v1 write endpoint (create/update/delete/import lead, create/update campaign, lifecycle actions, enroll/remove leads, steps, follow-ups, send reply, subscribe/unsubscribe webhook) plus a generic "Custom API Call" action.
- `src/lib/triggers/*.ts` — one `createTrigger` per webhook event (`TriggerStrategy.WEBHOOK`: `onEnable` subscribes via `POST /v1/webhooks/subscribe`, `onDisable` unsubscribes) plus polling triggers (`TriggerStrategy.POLLING`) for new leads / new conversations.
- `README.md` — build, install (self-hosted vs Cloud private piece), and contribution notes.

### Build & install

```bash
cd integrations/activepieces
npm install
npm run build
```

- **Self-hosted:** copy the built piece into your Activepieces `pieces/` directory (or install the `.tgz` via the admin piece catalogue) and restart.
- **Cloud:** upload the built `.tgz` as a private piece (Platform Admin → Catalogue → Pieces → Install Private Piece).

Then add the NxtSend piece to a flow, connect it (OAuth consent screen — pick `activepieces.read` unless the flow needs to write), and build from the triggers/actions below.

**The piece is NOT built, NOT installed anywhere, and NOT submitted to Activepieces.** Contributing it to the Activepieces repository is a separate step the owner must do; the private-piece path above works without it.

### No-piece path

Use Activepieces' built-in **HTTP Request** piece (Bearer token auth) for API calls and the **Webhook** trigger for events, with the same endpoints and subscribe call as above.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ACTIVEPIECES_ENABLED` | Enables/disables the Activepieces REST surface (OAuth routes stay available). | on (unset = on) |
| `ACTIVEPIECES_API_BASE_URL` | Public origin advertised in metadata (overrides `NEXT_PUBLIC_APP_URL`). | unset → `NEXT_PUBLIC_APP_URL` → request origin |
| `NEXT_PUBLIC_APP_URL` | Fallback public origin. | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live data + token store (required; Demo Mode refuses). | — |

## Config-ready vs pending

| Item | State |
| --- | --- |
| Scopes `activepieces.read` / `activepieces.write` + tier map + consent descriptions | Config-ready (mock-tested) |
| Resource URL `https://<origin>/api/integrations/activepieces` + `resourcePlatform()` | Config-ready (mock-tested) |
| REST API v1 routes (leads, campaigns, sequences, follow-ups, conversations, accounts, usage, searches, dropdowns) | Config-ready (mock-tested) |
| Webhook subscribe / unsubscribe / subscriptions (v1) + session subscriptions route | Config-ready (mock-tested) |
| Health endpoint `GET /api/integrations/activepieces/health` | Config-ready (mock-tested) |
| RFC 9728 protected-resource metadata route | Config-ready (mock-tested) |
| Migration 031 (webhook platform CHECK) | Written, not applied |
| OAuth client registration (DCR) for `activepieces` | **Blocked** — needs `src/lib/muse-connector/oauth/clients.ts` extension (coordinator) |
| Live Activepieces connection (grant + API call + webhook delivery) | **Credentials required** — needs the DCR block cleared, migrations 023–031 applied, and a real Activepieces instance |
| TypeScript piece (`integrations/activepieces/`) | **Build-verified** — tsc clean + runtime construct against `@activepieces/pieces-framework` 0.32.0 (17 actions, 9 triggers), 2026-11-19; not installed, not submitted |
| Panel component `src/components/integrations/activepieces/ActivepiecesPanel.tsx` | Written, not wired into any page (coordinator wires it) |

## What this API never does

- **No LinkedIn sending.** No LinkedIn-send/accept action, trigger or event exists anywhere in this API — there is no LinkedIn provider. Email inbox replies (write tier) are the only send.
- **No campaign launch.** Campaigns are created DRAFT ONLY. Launch validation lives in the dashboard wizard; there is no launch endpoint for any platform.
- **No message-draft endpoint.** Drafts are created in the dashboard / Co-pilot, not via the API.
- **No date-range report.** `GET /v1/usage` is all-time only; the date-range report is 501 by design.
- **Demo Mode refuses everything.** Every v1 route answers 503 in Demo Mode — demo data is never shared with an automation platform.

## Panel

`src/components/integrations/activepieces/ActivepiecesPanel.tsx` mirrors the Zapier/n8n live panels: health, endpoints, scopes, grants (with revoke), webhook subscriptions + recent deliveries, activity, connect steps, and the trigger/action/search inventory. It is not wired into the integrations detail page — the coordinator wires it. It never shows "Connected" without a real grant.
