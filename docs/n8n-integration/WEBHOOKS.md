# Webhooks — NxtSend × n8n

Webhooks are how NxtSend pushes events to n8n. The Trigger node
subscribes; NxtSend delivers signed payloads to the node's
webhook URL. The server side is **PENDING** (Worker B); the
design below is the contract, mirroring the Zapier REST Hook
implementation (migrations 025–027).

## Events (8)

| Event | Fired when |
|---|---|
| `lead.created` | A lead is created (any source, including the n8n API itself) |
| `lead.updated` | A lead changes; payload includes `changed_fields` |
| `lead.added_to_campaign` | A lead is enrolled in a campaign |
| `lead.removed_from_campaign` | A lead's enrollment is removed |
| `campaign.created` | A campaign is created (draft) |
| `campaign.status_changed` | A campaign moves between statuses |
| `conversation.reply_created` | A reply is created on a conversation (email replies included) |
| `subscription.changed` | A subscription changes |

## Subscribing

- **From n8n:** the NxtSend Trigger node (webhook mode)
  subscribes via `POST /api/integrations/n8n/webhooks/subscribe`
  with the event + the node's webhook URL.
- **Unsubscribe:** `POST /api/integrations/n8n/webhooks/unsubscribe`.
- **List (session):** `GET /api/integrations/n8n/subscriptions`
  lists this workspace's subscriptions plus the last 20
  deliveries — rendered on Settings → Integrations → n8n.
- One subscription per (workspace, event, target URL). The
  per-subscription HMAC secret is generated server-side at
  subscribe time and **never returned** — not by the subscribe
  response, not by the list endpoint, not by the admin panel.

## Signing (verify it)

Every delivery carries:

- `X-NxtSend-Signature` — HMAC-SHA256 of the payload with the
  per-subscription secret.
- `X-NxtSend-Timestamp` — delivery time; reject stale timestamps
  in your workflow (replay protection).

Verify the signature in the receiving workflow (n8n Code node)
before trusting the payload. The generic Outbound Webhooks entry
in the Integration Center documents the same scheme for a plain
n8n Webhook node; the NxtSend Trigger node verifies it for you
(per the contract — confirm against Worker C's node code when
it lands).

## Delivery + retry (latency honesty)

1. The mutation enqueues the event in the outbox.
2. A **best-effort immediate** delivery attempt is made.
3. On failure, the delivery waits for the **daily 06:00 cron**
   retry (5m → 30m backoff, max 3 attempts, then `dead`).
4. **A failed delivery may wait up to ~24h for its next retry.**
   Do not treat webhook triggers as instant-guaranteed delivery.
5. A `410` from n8n deactivates the subscription — the workflow
   or webhook is gone. Re-activate the workflow and re-subscribe.
6. The receiver must answer 2xx within 10 seconds (same rule as
   the generic webhook system).

## Monitoring

- **Settings → Integrations → n8n** — subscriptions + last 20
  deliveries for your workspace.
- **n8n Executions** — per-workflow runs.
- **Admin → Integrations → n8n** — platform-wide subscriptions,
  delivery counts, recent failed/dead deliveries.

## n8n vs the generic Outbound Webhooks entry

The Integration Center also has a generic "Outbound Webhooks
(n8n / Zapier)" entry: one endpoint per workspace, HMAC-signed,
configured manually. That is the **manual** path (paste a Webhook
node URL into NxtSend). This n8n entry is the **native** path
(the Trigger node subscribes itself, per-event, with its own
secret per subscription). Use one or the other for a given event,
not both — otherwise the workflow fires twice.
