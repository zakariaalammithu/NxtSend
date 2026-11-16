# Zapier Integration — Triggers

The CLI app (`integrations/zapier/`) offers **13 triggers**: 5
polling + 8 instant (REST Hook). All are verified against the real
server implementation, not just a written contract.

## Polling triggers — Zapier checks on your plan's interval

Polling is **minutes, not instant**. Each poll returns at most the
100 newest items. An update or status change on a record outside
that window is not seen by polling — use the Instant version.

| Trigger | Key | Endpoint | Dedupe |
|---|---|---|---|
| New Lead | `new_lead` | `GET /v1/leads` | Stable lead `id` |
| Lead Updated | `updated_lead` | `GET /v1/leads?order=updated_at_desc` | `<leadId>__<updated_at>` (original id in `lead_id`) |
| New Campaign | `new_campaign` | `GET /v1/campaigns` | Stable campaign `id` |
| Campaign Status Changed | `campaign_status_changed` | `GET /v1/campaigns` | `<campaignId>__<status>` (original id in `campaign_id`) |
| New Conversation | `new_conversation` | `GET /v1/conversations` | Stable conversation `id` |

Notes:

- Lists return envelopes (`{leads, count}`, `{campaigns, count}`,
  …), never bare arrays.
- Field naming follows the server's records exactly (snake_case:
  `first_name`, `job_title`, `linkedin_url`, `contact_name`,
  `display_name`, `handle_or_email`); campaign `type` is `linkedin`
  | `email` | `mixed` (not `channel`).
- `Lead Updated` orders by `updated_at` (migration 027) and dedups
  on `<leadId>__<updated_at>` so an update is seen once per
  timestamp.
- `Campaign Status Changed` polls the same campaign list and dedups
  on `<campaignId>__<status>`.

## Instant triggers — REST Hooks (webhook delivery)

| Trigger | Key | Event | `data` payload (server emit) |
|---|---|---|---|
| New Lead (Instant) | `new_lead_instant` | `lead.created` | `{source, leadId, email, firstName, company}` |
| Lead Updated (Instant) | `updated_lead_instant` | `lead.updated` | `{source, leadId, changed_fields}` |
| Lead Added to Campaign (Instant) | `lead_added_to_campaign_instant` | `lead.added_to_campaign` | `{source, campaignId, leadIds, enrolled}` |
| Lead Removed From Campaign (Instant) | `lead_removed_from_campaign_instant` | `lead.removed_from_campaign` | `{source, campaignId, leadId}` |
| New Campaign (Instant) | `new_campaign_instant` | `campaign.created` | `{source, campaignId, name, status}` |
| Campaign Status Changed (Instant) | `campaign_status_changed_instant` | `campaign.status_changed` | `{source, campaignId, status, previous_status}` |
| New Reply (Instant) | `new_reply_instant` | `conversation.reply_created` | `{source, conversationId, messageId, duplicate}` |
| Subscription Changed (Instant) | `subscription_changed_instant` | `subscription.changed` | `{source, plan, status, stripeSubscriptionId, stripeCustomerId}` |

Payloads are the server envelope `{id, type, created_at,
workspace_id, data}`; `id` is the stable event id for dedup.
Delivery: the mutation enqueues and a best-effort immediate attempt
is made; failures retry via the `zapier_webhook_retry` job on the
**daily 06:00 cron** (exponential backoff, max 3 attempts, then
dead) — so a failed delivery may wait **up to ~24h** for its next
retry. **Do not claim instant guaranteed delivery.** A 410 from
Zapier deactivates the subscription. Zapier does **not** verify the
`X-NxtSend-Signature` / `X-NxtSend-Timestamp` signing headers —
nothing here claims it does. Unsubscribing an unknown id is treated
as already unsubscribed.

Notes:

- `conversation.reply_created` fires only for dashboard + Zapier
  replies — MCP-tool and scheduled-reply sends do not emit yet.
- `subscription.changed` is the only billing event (no
  invoice/payment events).
- There is **no polling version** of Lead Added/Removed, New Reply,
  or Subscription Changed: no list endpoint surfaces those events.
  If the server later adds an events feed (e.g. `GET /v1/events`)
  or a campaign-membership list, polling variants can be added.
- Webhook `data` payloads mix conventions — see each instant
  trigger's output fields in `integrations/zapier/triggers/instant/`.

## What is NOT a trigger

- Anything LinkedIn-send / connection-accept related — no such
  event is emitted (`accepted` is always null; no LinkedIn send
  exists in the product).
- Invoice / payment events — `subscription.changed` is the only
  billing event.
