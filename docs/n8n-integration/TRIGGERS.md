# Triggers — NxtSend Trigger node

The **NxtSend Trigger** node starts a workflow when something
changes in NxtSend. Two trigger kinds: **webhook** (push) and
**polling** (pull). The node package is **LANDED**
(`integrations/n8n-nodes-nxtsend/`, v0.1.0 — build, lint and
126 tests pass); it is not published on npm and not verified
by n8n.

## Webhook triggers (8 events)

The Trigger node subscribes to NxtSend events via
`POST /api/integrations/n8n/webhooks/subscribe`. The subscription
carries a per-subscription HMAC secret (generated server-side,
never returned) and NxtSend POSTs a signed payload to the node's
webhook URL on each event.

| Trigger | Event | Payload carries |
|---|---|---|
| New Lead | `lead.created` | The new lead |
| Lead Updated | `lead.updated` | The lead + `changed_fields` |
| Lead Added to Campaign | `lead.added_to_campaign` | Lead + campaign |
| Lead Removed From Campaign | `lead.removed_from_campaign` | Lead + campaign |
| New Campaign | `campaign.created` | The new campaign (draft) |
| Campaign Status Changed | `campaign.status_changed` | Campaign + old/new status |
| New Reply | `conversation.reply_created` | The reply + conversation |
| Subscription Changed | `subscription.changed` | Subscription change |

**Latency honesty — read this before building time-sensitive
workflows.** The mutation enqueues the event and a best-effort
immediate delivery attempt is made. If it fails, retries run on
the **daily 06:00 cron** (5m → 30m backoff, max 3 attempts, then
`dead`). **A failed delivery may wait up to ~24h for its next
retry.** Webhook triggers are therefore *near-real-time on the
happy path, up to a day late on the failure path*. Do not build
a workflow that assumes a failed delivery is retried in minutes.

- A `410` response from n8n deactivates the subscription (the
  workflow/webhook is gone).
- Verify `X-NxtSend-Signature` / `X-NxtSend-Timestamp` in the
  receiving workflow (see [WEBHOOKS.md](WEBHOOKS.md)).
- Subscriptions + last 20 deliveries are visible on Settings →
  Integrations → n8n and in the admin n8n panel.

## Polling triggers (9)

The Trigger polls the REST API on the workflow's interval
(minutes, not instant). Each poll returns at most the 100 newest
items. Design from the node package (`nodes/shared/constants.ts`
`POLL_ENDPOINTS`): **every webhook event is pollable** — the
Trigger node file itself is now landed (`nodes/NxtSendTrigger/NxtSendTrigger.node.ts`)
and the package builds. One live run per trigger in a real n8n instance
is still PENDING (no Docker in this environment).

| Trigger | Endpoint | Dedupe |
|---|---|---|
| New Lead | `GET /v1/leads` | Stable lead id |
| Lead Updated | `GET /v1/leads?order=updated_at_desc` | `<leadId>__<updated_at>` (original id in `lead_id`) |
| Lead Added to Campaign | `GET /v1/leads?order=updated_at_desc` | Enrolment seen on a changed lead row |
| Lead Removed From Campaign | `GET /v1/leads?order=updated_at_desc` | Enrolment missing from a changed lead row |
| New Campaign | `GET /v1/campaigns` | Stable campaign id |
| Campaign Status Changed | `GET /v1/campaigns` | `<campaignId>__<status>` (original id in `campaign_id`) |
| New Reply | `GET /v1/conversations` | Reply id on a changed conversation |
| New Conversation (polling-only) | `GET /v1/conversations` | Stable conversation id, by `created_at` |
| Subscription Changed | `GET /v1/webhooks/subscriptions` | Subscription list compared against ids seen on previous polls (no timestamp field exists) |

- An update or status change on a record outside the 100-newest
  window is not seen by polling — use the webhook version.
- **New Conversation is polling-only.** NxtSend emits no webhook
  event for a new conversation, so `conversation.created` exists
  only in polling mode (it polls `/v1/conversations` by
  `created_at`). Activating the Trigger in webhook mode with this
  event refuses loudly instead of registering a subscription the
  server can never fire. This closes the gap flagged in earlier
  drafts (no New Conversation poll) — the same shape as Zapier's
  polling-only New Conversation trigger.

## Which trigger to use

| Need | Use |
|---|---|
| React promptly to a change | Webhook trigger (and accept the ~24h worst-case retry latency) |
| n8n instance not reachable from the internet (no public webhook URL) | Polling trigger |
| Lead Added/Removed, New Reply, Subscription Changed | Webhook trigger — polling cannot see these |

## Skipped: LinkedIn triggers

LinkedIn connection-accepted and LinkedIn-reply templates were
**skipped deliberately** — no event source exists for them. There
is no authorized LinkedIn provider, and the official LinkedIn API
exposes no connection-request/DM endpoints to standard developers.
See [WORKFLOW_TEMPLATES.md](WORKFLOW_TEMPLATES.md).
