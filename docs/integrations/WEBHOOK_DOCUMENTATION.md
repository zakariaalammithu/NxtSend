# Webhook Documentation

NxtSend delivers outbound webhooks to Zapier, n8n, Make, Pabbly,
Albato, and Activepieces subscriptions through one shared outbox
(`src/lib/integrations/rest/outbox.ts`; Zapier re-exports the same
implementation). Both platforms receive exactly the same events in the
same envelope shape.

**Status reminder:** webhooks are implemented and mock-tested. No live
delivery to a real subscriber URL has ever happened.

## 1. The 8 events

| Event | When it fires |
| --- | --- |
| `lead.created` | A lead was created (manually, via CSV import, or via the REST API) |
| `lead.updated` | A lead was updated (any successful update; payload carries `changed_fields`) |
| `lead.added_to_campaign` | One or more leads were enrolled into a campaign |
| `lead.removed_from_campaign` | A lead's enrollment was removed |
| `campaign.created` | A campaign is created |
| `campaign.status_changed` | Pause / resume / archive / draft moves |
| `conversation.reply_created` | An inbox reply reached a terminal `sent` (or `simulated`) outcome — email channel only |
| `subscription.changed` | A Stripe subscription mutation was applied to a workspace (plan/status) |

Each event is wired to a real mutation path
(`src/lib/integrations/rest/emit.ts` and the repository decorators in
`src/lib/data/webhook-emission.ts`). Nothing is emitted speculatively.

### What is NOT an event

- **`conversation.created` does not exist as a webhook event.** There
  is no data source that produces it — conversations are only
  reachable by **polling** `GET /api/integrations/<platform>/v1/conversations`.
- **Anything LinkedIn-send or connection-accept related** — no LinkedIn
  send exists in the product and `accepted` is always null.

## 2. Envelope

```json
{
  "id": "evt_…",
  "type": "lead.created",
  "created_at": "2026-11-19T00:00:00.000Z",
  "workspace_id": "ws_…",
  "data": { "…event-specific payload…" }
}
```

- `id` is the stable dedup id. One event fans out to every platform's
  subscriptions, and the outbox dedups on `(event_id, subscription_id)`.
- `data` carries the event payload (for `lead.updated` it includes
  `changed_fields`).

## 3. Subscribing

| Action | Endpoint |
| --- | --- |
| Create subscription | `POST /api/integrations/<platform>/v1/webhooks/subscribe` |
| List subscriptions | `GET /api/integrations/<platform>/v1/webhooks/subscriptions` (and `GET /api/integrations/<platform>/subscriptions`) |
| Delete subscription | `POST /api/integrations/<platform>/v1/webhooks/unsubscribe` |

For Zapier, subscriptions are created by the Zapier app itself when a
user turns on an instant trigger (REST Hook); for n8n, by the Trigger
node. A subscription records a target URL + event types + a
**per-subscription HMAC secret**. The secret is generated server-side
and **never returned** by any API response — the subscriber must
capture it at creation time from the creation flow that owns it, and
it is never shown again (not in the UI, API, or logs).

## 4. HMAC signing

Every delivery is signed with the subscription's secret. The receiver
should verify the signature on every delivery before trusting the
payload, and reject deliveries whose signature does not match. (The
exact header name and signing scheme are defined in
`src/lib/integrations/rest/outbox.ts` — read the code, not this doc,
before implementing a receiver; this doc does not restate the scheme
from memory.)

## 5. Delivery, retries, and dead-lettering

- **Best-effort immediate delivery first:** when an event is emitted,
  the outbox attempts delivery to each matching subscription right away.
- **Retry on failure:** a failed delivery is retried with backoff
  **5 minutes → 30 minutes, max 3 attempts** (`DELIVERY_MAX_ATTEMPTS = 3`).
- **Daily cron retry:** the `0 6 * * *` cron (`/api/jobs/run`) also
  processes the outbox. A delivery that fails just after a cron run
  can therefore wait **up to ~24 hours** before its next retry.
  Treat webhook delivery as eventually-consistent, not real-time.
- **Dead-lettering:** after the 3rd failed attempt a delivery is
  marked `dead` and is not retried again.
- **410 deactivation:** if the receiver responds **HTTP 410**, the
  subscription is deactivated and the delivery is dead immediately —
  410 means "this subscription is gone", so NxtSend stops sending to
  it. Any other non-2xx response (or network error) is a failure with
  backoff, not a deactivation.
- **2xx = delivered.** Anything else follows the rules above.

## 6. What the subscriber should do

1. Return 2xx promptly; do slow work asynchronously.
2. Verify the HMAC signature before acting on a payload.
3. Dedup on the envelope `id` — at-least-once delivery is possible
   (a retry after a successful-but-unacknowledged delivery will
   re-send the same `id`).
4. Return 410 when the endpoint is permanently gone so NxtSend stops
   wasting retries on it.
5. Do not rely on sub-minute latency: the retry path can wait up to
   ~24 hours (see §5).

## 7. Inbound webhooks (other direction)

Two inbound cases exist and are separate from the outbox above:

- **RB2B** (enrichment adapter) receives inbound webhooks from RB2B,
  verified with the `RB2B_WEBHOOK_SECRET`.
- **Resend / Stripe** inbound webhooks are verified with their own
  signing secrets (`RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`)
  and are part of the core product, not the integration outbox.
