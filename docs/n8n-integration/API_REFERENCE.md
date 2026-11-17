# API Reference — NxtSend × n8n

Base: `https://<your-domain>/api/integrations/n8n`. Auth:
`Authorization: Bearer <apiKey | OAuth2 access token>` —
verified from the node package (`nodes/shared/constants.ts`).
Rate limit **120 requests/minute** (same constant). **Status:
all v1 routes, `/health` and `/api-keys` routes are LANDED.**
Every row in the tables below is a real route in the repo
(`src/app/api/integrations/n8n/`), verified against the code —
including the two `accounts/:id` routes, which landed in the
coordinator reconciliation pass. The node package's endpoint map
(`OPERATION_ENDPOINTS`) matches this table.

## Public

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | None | `{mode, n8nEnabled, version}` — proves the route answers, not that n8n is connected |

## Auth / test

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/v1/auth/test` | Token or key | The user, workspace and scopes for the credential — never token/key values |

## API keys (session auth — the settings page)

| Method | Path | Notes |
|---|---|---|
| GET | `/api-keys` | Lists keys: `id`, `name`, `key_prefix`, `scopes`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`. Never hashes or values. |
| POST | `/api-keys` | Body: `name`, `scopes` (`n8n.read` / `n8n.write`), optional `expires_at`. Returns the key **once**, as the top-level `key` field (`POST /api/integrations/n8n/api-keys`, 201) — confirmed in code; the settings panel reads `key` first (with `api_key.key` / `plaintext_key` as fallbacks). Keys look like `nxt_live_…`. |
| DELETE | `/api-keys?id=…` | Revokes immediately. |

## Leads (Contact = Lead)

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/leads` | `n8n.read` | List; supports `order=updated_at_desc` for polling |
| GET | `/v1/leads/:id` | `n8n.read` | |
| POST | `/v1/leads` | `n8n.write` | Email dedup — duplicate returns existing lead with `duplicate: true` |
| PATCH | `/v1/leads/:id` | `n8n.write` | Emits `lead.updated` with `changed_fields` |
| DELETE | `/v1/leads/:id` | `n8n.write` | Node-mapped (Lead Delete) |
| POST | `/v1/leads/import` | `n8n.write` | Bulk, max 100 rows; `skipped` covers invalid rows and duplicates |

## Campaigns

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/campaigns` | `n8n.read` | List |
| GET | `/v1/campaigns/:id` | `n8n.read` | |
| POST | `/v1/campaigns` | `n8n.write` | **Draft only.** At least one sequence step required. No dedup key — a retried create can duplicate. |
| PATCH | `/v1/campaigns/:id` | `n8n.write` | Name / type / description only |
| POST | `/v1/campaigns/:id/pause` | `n8n.write` | Needs active |
| POST | `/v1/campaigns/:id/resume` | `n8n.write` | Needs paused |
| POST | `/v1/campaigns/:id/stop` | `n8n.write` | Moves to archived — no stopped status |
| POST | `/v1/campaigns/:id/archive` | `n8n.write` | Refuses already-archived |
| POST | `/v1/campaigns/:id/leads` | `n8n.write` | Returns `{enrolled, skipped, notFound}` |
| DELETE | `/v1/campaigns/:id/leads/:leadId` | `n8n.write` | Removes enrollment; lead record kept |
| GET | `/v1/campaigns/:id/performance` | `n8n.read` | Real stats; `accepted` always `null` |

**No campaign-launch endpoint exists.** **No drafts endpoint
exists** (no draft concept in the product).

## Sequences

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/campaigns/:id/sequence` | `n8n.read` | Node-mapped (Sequence Get Sequence) |
| POST | `/v1/campaigns/:id/steps` | `n8n.write` | Node-mapped (Sequence Replace Steps, full replace) |
| GET | `/v1/campaigns/:id/follow-ups` | `n8n.read` | Node-mapped |
| POST | `/v1/campaigns/:id/follow-ups` | `n8n.write` | Node-mapped (Schedule Follow-Up). Body is the server's `ScheduleReplyInput`: `{conversation_id, body, scheduled_at}` (snake_case, all required). The node sends exactly these three fields. |
| DELETE | `/v1/campaigns/:id/follow-ups/:followUpId` | `n8n.write` | Node-mapped (Cancel Follow-Up) |
| GET | `/v1/campaigns/:id/execution-status` | `n8n.read` | Node-mapped |

## Conversations

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/conversations` | `n8n.read` | List |
| GET | `/v1/conversations/:id` | `n8n.read` | Thread |
| POST | `/v1/conversations/:id/replies` | `n8n.write` | **Email only.** LinkedIn replies refused 422. `IdempotencyKey` replays retried replies. |

## Accounts, usage, searches, dropdowns

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/accounts` | `n8n.read` | Connected accounts (read-only) |
| GET | `/v1/accounts/:id` | `n8n.read` | Node-mapped (LinkedIn Account Get) — landed in the coordinator reconciliation pass |
| GET | `/v1/accounts/:id/status` | `n8n.read` | Node-mapped (LinkedIn Account Get Status) — landed in the coordinator reconciliation pass. Returns `{account_status: {account_id, channel, provider, display_name, handle_or_email, status, auth_status, connected, warmup_status, warmup_enabled, last_sync_at, last_error}}`; `connected` is true only when the recorded `status` is `"connected"` — never a live probe. |
| GET | `/v1/usage` | `n8n.read` | Workspace usage (also powers the node's Analytics operations) |
| GET | `/v1/search/leads` | `n8n.read` | Find Lead (name / email / ID) |
| GET | `/v1/search/campaigns` | `n8n.read` | Find Campaign (name / ID / status) |
| GET | `/v1/search/conversations` | `n8n.read` | Find Conversation (search text) |
| GET | `/v1/search/accounts` | `n8n.read` | Find LinkedIn Account (search text) |
| GET | `/v1/dropdowns/campaigns` | `n8n.read` | |
| GET | `/v1/dropdowns/accounts` | `n8n.read` | |
| GET | `/v1/dropdowns/lead-statuses` | `n8n.read` | |
| GET | `/v1/dropdowns/sequences?campaign_id=` | `n8n.read` | `campaign_id` required |

## Webhooks

**Routes landed (Worker B).** Tables are the shared webhook
tables with the `platform='n8n'` discriminator (migration 029,
written not applied).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/webhooks/subscribe` | Token or key | Subscribes the Trigger node; per-subscription HMAC secret generated server-side, never returned |
| POST | `/webhooks/unsubscribe` | Token or key | |
| GET | `/webhooks/subscriptions` | Token or key | |
| GET | `/subscriptions` | Session (settings page) | Subscriptions + last 20 deliveries for the workspace |

## Errors

| HTTP | Meaning |
|---|---|
| 400 | Bad input (missing required field, bad enum) |
| 401 | Unknown/expired/revoked token or key; wrong resource binding |
| 403 | Scopes do not cover the call |
| 404 | Record not found |
| 422 | Refused by design (LinkedIn reply; wrong campaign state) |
| 503 | Demo Mode, or surface disabled |

## Rate limits

**120 requests/minute** per token/key, enforced server-side in
`src/lib/integrations/rest/auth.ts` (`REST_RATE_LIMIT_PER_MINUTE
= 120`, in-memory per process like Zapier's; exceeding it returns
429 "Rate limit exceeded: 120 requests per minute per token.").
The limit is per access token / API key, not per workspace.
