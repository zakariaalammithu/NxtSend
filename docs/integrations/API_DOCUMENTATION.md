# API Documentation

The v1 REST API and the MCP servers. Everything here was read from the
route files under `src/app/api/` and the shared REST layer in
`src/lib/integrations/rest/` at base commit `f8dea22`.

**Status reminder:** the API is implemented and mock-tested. No provider
has been live-verified against real credentials, and no live API call
from an external platform has ever succeeded against a deployed
instance. The deploy itself is behind (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## 1. Surfaces

| Surface | Base path | Platforms |
| --- | --- | --- |
| REST API v1 | `/api/integrations/<platform>/v1/` | zapier, n8n, make, pabbly, albato, activepieces |
| MCP (Muse) | `/api/mcp` | Muse (Meta) |
| MCP (ChatGPT) | `/api/mcp/chatgpt` | ChatGPT |
| MCP (Claude) | `/api/mcp/claude` | Claude |
| Health | `/api/mcp/health`, `/api/integrations/<platform>/health` | all |

## 2. REST API v1 — route inventory

All six platforms share one implementation (`src/lib/integrations/rest/`);
each platform's routes are thin wrappers over it. The v1 route set is
identical for n8n, Make, Pabbly, Albato, and Activepieces (**33 v1
routes each**); Zapier has **26 v1 routes** (the common set minus the
7 n8n-family extras: account detail/status, execution status,
follow-ups, sequence, and steps).

Route files per platform directory (v1 + health + subscriptions +
webhooks + extras): Zapier 29, n8n 41, Make/Pabbly/Albato/Activepieces
35 each. n8n's extra 8 are the API-key routes (`/api/integrations/n8n/api-keys`),
the webhook test/retry routes, and the non-v1 webhook subscribe routes.

### 2.1 Accounts

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/accounts` | List connected accounts |
| `GET /api/integrations/<platform>/v1/accounts/[id]` | Get one account (not on Zapier) |
| `GET /api/integrations/<platform>/v1/accounts/[id]/status` | Account connection status (not on Zapier) |

### 2.2 Leads

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/leads` | List leads |
| `POST /api/integrations/<platform>/v1/leads` | Create a lead |
| `GET /api/integrations/<platform>/v1/leads/[id]` | Get one lead |
| `PATCH /api/integrations/<platform>/v1/leads/[id]` | Update a lead |
| `DELETE /api/integrations/<platform>/v1/leads/[id]` | Delete a lead |
| `POST /api/integrations/<platform>/v1/leads/import` | Bulk import leads |

### 2.3 Campaigns

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/campaigns` | List campaigns |
| `POST /api/integrations/<platform>/v1/campaigns` | Create a campaign |
| `GET /api/integrations/<platform>/v1/campaigns/[id]` | Get one campaign |
| `PATCH /api/integrations/<platform>/v1/campaigns/[id]` | Update a campaign |
| `DELETE /api/integrations/<platform>/v1/campaigns/[id]` | Delete a campaign |
| `POST /api/integrations/<platform>/v1/campaigns/[id]/[action]` | Campaign lifecycle action (pause / resume / archive / draft). **Launch is dashboard-only** — there is no API launch action. |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/performance` | Per-campaign performance (all-time; no date filter) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/execution-status` | Execution status (not on Zapier) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/sequence` | Sequence steps (not on Zapier) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/steps` | Steps (not on Zapier) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/follow-ups` | List follow-ups (not on Zapier) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/follow-ups/[followUpId]` | One follow-up (not on Zapier) |
| `GET /api/integrations/<platform>/v1/campaigns/[id]/leads` | Leads in a campaign |
| `POST /api/integrations/<platform>/v1/campaigns/[id]/leads` | Add leads to a campaign |
| `DELETE /api/integrations/<platform>/v1/campaigns/[id]/leads/[leadId]` | Remove a lead from a campaign |

### 2.4 Conversations (inbox)

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/conversations` | List conversations |
| `GET /api/integrations/<platform>/v1/conversations/[id]` | Get one conversation |
| `POST /api/integrations/<platform>/v1/conversations/[id]/replies` | Send a reply (email channel only; no LinkedIn send exists) |

`conversation.created` is **not** a webhook event — conversations are
only reachable by polling these routes (see
[WEBHOOK_DOCUMENTATION.md](./WEBHOOK_DOCUMENTATION.md)).

### 2.5 Search, dropdowns, usage

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/search/leads` | Search leads |
| `GET /api/integrations/<platform>/v1/search/campaigns` | Search campaigns |
| `GET /api/integrations/<platform>/v1/search/accounts` | Search accounts |
| `GET /api/integrations/<platform>/v1/search/conversations` | Search conversations |
| `GET /api/integrations/<platform>/v1/dropdowns/accounts` | Account picker values |
| `GET /api/integrations/<platform>/v1/dropdowns/campaigns` | Campaign picker values |
| `GET /api/integrations/<platform>/v1/dropdowns/lead-statuses` | Lead-status picker values |
| `GET /api/integrations/<platform>/v1/dropdowns/sequences` | Sequence picker values |
| `GET /api/integrations/<platform>/v1/usage` | Workspace usage summary |

### 2.6 Auth test, health, subscriptions

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/<platform>/v1/auth/test` | Verify the caller's token (returns the grant's workspace/scopes; makes no provider call) |
| `GET /api/integrations/<platform>/health` | Platform health (public; no auth) |
| `GET /api/integrations/<platform>/subscriptions` | List webhook subscriptions |
| `POST /api/integrations/<platform>/v1/webhooks/subscribe` | Create a webhook subscription |
| `GET /api/integrations/<platform>/v1/webhooks/subscriptions` | List subscriptions (v1) |
| `POST /api/integrations/<platform>/v1/webhooks/unsubscribe` | Delete a subscription |

n8n extras: `GET/POST /api/integrations/n8n/api-keys` (create/list
scoped API keys), webhook `subscribe` / `unsubscribe` / `test` /
`retry` under `/api/integrations/n8n/webhooks/`, and
`POST /api/integrations/n8n/webhooks/retry`.

### 2.7 Integration Center / generic routes

| Method & path | Purpose |
| --- | --- |
| `GET /api/integrations/status` | Integration Center status summary |
| `POST /api/integrations/[id]/verify` | Run the Center verify flow for one integration id (see §5 — most new adapter ids have no case and fall through to the generic outcome) |
| `POST /api/integrations/zapier/emit` | Emit a Zapier webhook event (internal) |

## 3. MCP servers

| Server | Tools | Notes |
| --- | --- | --- |
| `/api/mcp` (Muse) | Registry text says 18; **the code serves the full 54-tool manifest** (36 Read / 14 Write / 4 Sensitive) — see inventory §1 and §8. Per-grant scope enforcement applies. | Streamable HTTP, JSON-RPC 2.0 |
| `/api/mcp/chatgpt` | 54 tools | Same 54-tool manifest; per-grant scope enforcement; Apps SDK widget render pending |
| `/api/mcp/claude` | 54 tools + 4 text-only MCP prompts + read-only `nxtsend://account` resource | Same manifest; per-grant scope enforcement |

All three servers share one adapter (`src/lib/muse-connector/adapter.ts`).
Tool calls are recorded in the audit log as `muse.tool.*` **for all
three clients** — there is no per-client audit split (see
[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)).

### 3.1 Tools that are deliberately unavailable

| Tool / operation | Behaviour | Reason |
| --- | --- | --- |
| `get_date_range_report` | HTTP 501, code `date_range_not_supported` | Stats loaders compute over all-time records and expose no date filter; a date-range report would have to invent filtered numbers. Use `get_performance_summary` (workspace-wide, all-time) or `get_campaign_performance` (one campaign) instead. |
| Campaign launch | No tool, no REST action | Launch is dashboard-only by design. |
| Message drafting | No endpoint | No message-draft endpoint exists on any surface. |
| LinkedIn send / connection accept | Not present on any surface | No LinkedIn-send/accept anywhere; `accepted` stays null. |
| `private_key_jwt` client auth | NOT SUPPORTED | Clients use DCR/CIMD public-client auth with PKCE S256. |

## 4. Authentication

- **REST v1:** `Authorization: Bearer <access-token>` (OAuth 2.0,
  issued by the shared server — see [OAUTH_SETUP.md](./OAUTH_SETUP.md)),
  or for n8n only, a scoped API key `nxt_live_...` (same header).
  The token resolves to a workspace + scope set
  (`resolveRestContext` in `src/lib/integrations/rest/auth.ts`).
- **MCP:** OAuth 2.0 bearer token from the shared server, bound to the
  MCP resource (`resource` parameter, RFC 8707).
- **Health endpoints:** public, no auth.
- **Demo Mode:** refused with 503 `demo_mode` before any handler runs
  — the REST API never serves demo data.
- **Admin kill-switch:** an admin can disable a provider
  (`/api/admin/integrations/monitoring/[provider]/disable`,
  migration 038). A disabled provider's REST calls fail with
  503 `provider_disabled`. The flag is enforced on the **six REST
  automation platforms only** (via `resolveRestContext`); the connect
  flow for config-ready adapters is not yet gated (see
  [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)).

## 5. Error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_params` | Bad input (e.g. `startDate` after `endDate`) |
| 401 | `unauthorized` | Missing/invalid/expired token or API key |
| 403 | `forbidden` / scope error | Token lacks the required tier (e.g. n8n API key without `n8n.write`) |
| 404 | `not_found` | Unknown id |
| 429 | `rate_limited` | More than 120 requests/minute for this token — back off and retry |
| 501 | `date_range_not_supported` | `get_date_range_report` (see §3.1) |
| 503 | `demo_mode` | The app is in Demo Mode; the REST API refuses to serve demo data |
| 503 | `provider_disabled` | An admin disabled this provider (kill-switch, migration 038) |

Error bodies are JSON: `{ "error": "<message>", "code": "<code>" }`
(shape per route; check the route's test for the exact body).

## 6. Rate limits

| Surface | Limit | Implementation |
| --- | --- | --- |
| REST v1 | **120 requests/minute per access token** (`REST_RATE_LIMIT_PER_MINUTE`) | In-memory fixed window, per process |
| MCP | **120 requests/minute per grant** (`MCP_RATE_LIMIT_PER_MINUTE`) | In-memory fixed window, per process |

Both limits are **in-memory per process on serverless**: a token that
lands on another Vercel instance gets a fresh budget. Treat 120/min
as a brake against runaway loops, not a guaranteed quota. The
reference values are pinned as literals (120 / 120 / 3) in
`src/app/(dashboard)/dashboard/developers/reference.ts` and asserted
by its test — see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).

## 7. Idempotency

There is **no persistent idempotency ledger**. A retried
`create_campaign` may duplicate the campaign (the email-outreach
adapters generate per-batch idempotency keys for lead uploads, e.g.
`nxtsend-<campaignId>-<timestamp>-<offset>`, but campaign creation
itself has no dedupe). Clients must not blindly retry creates; check
for existence first (list/search) before re-creating.
