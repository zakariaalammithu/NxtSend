# Zapier Integration — API Reference

Base: `/api/integrations/zapier/v1/*`. Auth on every route: Bearer
access token for the Zapier resource + `zapier.read` (GETs) /
`zapier.write` (mutations) tier checks. Demo Mode → 503, unknown
token → 401, insufficient scope → 403 `{error, code}`, rate limit
120 req/min per token (in-memory, per-process — same limitation as
the MCP limiter; not a distributed quota). Errors are `{error}` +
`code` where it helps Zapier. Workspace-scoped by the token's grant;
every read/write re-checks `workspace_id`.

Health is public: `GET /api/integrations/zapier/health` →
`{mode, zapierEnabled, version: "1.0.0"}`.

## Leads

| Route | Notes |
|---|---|
| `GET /v1/leads?limit=&after=&order=` | Newest first; `order` `created_at_desc` (default) or `updated_at_desc`; `after` = exclusive ISO cursor; `limit` default 50, max 100. Stable `id` per item. |
| `GET /v1/leads/:id` | |
| `POST /v1/leads` | Dedups by email → `{lead, duplicate}`. |
| `PATCH /v1/leads/:id` | Incl. status; emits `lead.updated` with `changed_fields`. |
| `POST /v1/leads/import` | Max 100; `{created, skipped, leads}`. |

## Campaigns

| Route | Notes |
|---|---|
| `GET /v1/campaigns`, `GET /v1/campaigns/:id` | `:id` includes steps. |
| `POST /v1/campaigns` | **Draft only.** Zapier cannot launch a campaign directly — no server-side wizard launch validation exists to reuse. Launch from the dashboard, then pause/resume from Zapier. |
| `PATCH /v1/campaigns/:id` | Name/type/description; a `status` in the body follows the action transition rules. |
| `POST /v1/campaigns/:id/pause\|resume\|stop\|archive` | `stop` → archived. Pause needs active, resume needs paused, stop/archive refuse already-archived — the MCP adapter's `requiredFrom` rules. |
| `GET /v1/campaigns/:id/performance` | Real stats via `loadCampaignStats`. `accepted` is always `null` — no data source exists; never fabricated. |
| `POST /v1/campaigns/:id/leads` | `{lead_ids}` → `{enrolled, skipped, notFound}`. |
| `DELETE /v1/campaigns/:id/leads/:leadId` | Removes the enrollment; the lead record is kept. |

## Conversations

| Route | Notes |
|---|---|
| `GET /v1/conversations`, `GET /v1/conversations/:id` | Thread = conversation + messages. |
| `POST /v1/conversations/:id/replies` | Existing `sendInboxReply`: email only, LinkedIn refused 422, `idempotencyKey` required, duplicates replayed never re-sent. |

## Accounts, usage, auth

| Route | Notes |
|---|---|
| `GET /v1/auth/test` | Connection label: `{user: {id, email}, workspace: {id, name}, scopes}`. Never token values. |
| `GET /v1/accounts` | Connected accounts, read-only. |
| `GET /v1/usage` | Workspace usage + plan. (The CLI does not map its response shape to any trigger/action output — only the Subscription Changed hook surfaces subscription state.) |

## Search

| Route | Notes |
|---|---|
| `GET /v1/search/leads?q=&email=&id=` | Actual matches; empty array when none. |
| `GET /v1/search/campaigns?q=&id=&status=` | |
| `GET /v1/search/conversations?q=` | |
| `GET /v1/search/accounts?q=` | |

## Dropdowns

| Route | Notes |
|---|---|
| `GET /v1/dropdowns/campaigns`, `/accounts`, `/lead-statuses` | |
| `GET /v1/dropdowns/sequences?campaign_id=` | Steps belong to a campaign, so `campaign_id` is required. |

## Webhooks

| Route | Notes |
|---|---|
| `POST /v1/webhooks/subscribe` | See [WEBHOOKS.md](WEBHOOKS.md). |
| `POST /v1/webhooks/unsubscribe` | |
| `GET /v1/webhooks/subscriptions` | |

## Server-side emit (internal)

`POST /api/integrations/zapier/emit` — session-authenticated;
the browser notifier posts dashboard mutations here (workspace from
the session). Not part of the Zapier-facing API.

## Deliberately omitted endpoints (not invented)

- `POST /v1/conversations/:id/drafts` — no draft concept exists in
  the product. Drafting is a UI/AI feature (`draftOutreachMessage`),
  not a stored draft. NOT SUPPORTED.
- `GET /v1/dropdowns/templates` — no message-template store exists
  in the product (prompt snippets are AI-drafting prompts, not
  outreach templates). Omitted, not faked.

## Route inventory (verified)

28 route files under `src/app/api/integrations/zapier/` (health,
emit, 26 × `v1/*`) + 1 protected-resource metadata route under
`src/app/.well-known/oauth-protected-resource/api/integrations/zapier/`
= **29 Zapier route files**, all present in the production build
output (`.next/server/app/...`). An earlier brief said 30; the
verified count is 29.
