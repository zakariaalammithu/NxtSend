# Zapier Integration — Webhooks (REST Hooks)

NxtSend emits events to Zapier through **REST Hooks**: Zapier
subscribes with a target URL, NxtSend POSTs each event to it.

## Subscribe / unsubscribe

| Call | Endpoint | Behaviour |
|---|---|---|
| Subscribe | `POST /v1/webhooks/subscribe {event, target_url}` | → `{id, event, target_url}` (201; a duplicate active subscription returns the existing id). `target_url` must be https on `hooks.zapier.com` (the real Catch Hook host — REST Hook `targetUrl`s look like `https://hooks.zapier.com/hooks/catch/<id>/<token>/`) or `zapier.com`. |
| Unsubscribe | `POST /v1/webhooks/unsubscribe {id}` | → 200 (idempotent; unknown id → 404). Deactivates, never hard-deletes. |
| List | `GET /v1/webhooks/subscriptions` | Active subscriptions for the workspace. Secrets never included. |

The per-subscription HMAC secret is generated server-side and
**never returned** — not in the subscribe response, not in any list.

## Events (8)

These are the only events NxtSend genuinely emits — each one is
wired to a real mutation path:

| Event | When it fires |
|---|---|
| `lead.created` | A lead is created (manually, via CSV import, or via the Zapier API). |
| `lead.updated` | Any successful lead update; payload carries `changed_fields`. Powered by migration 027's `leads.updated_at` trigger. |
| `lead.added_to_campaign` | Leads enrolled into a campaign. |
| `lead.removed_from_campaign` | A lead's enrollment removed. |
| `campaign.created` | A campaign is created. |
| `campaign.status_changed` | Pause / resume / archive / draft moves. |
| `conversation.reply_created` | An inbox reply reached a terminal `sent` (or `simulated`) outcome — dashboard reply route, Zapier reply route. MCP/scheduled-reply sends do not emit yet. |
| `subscription.changed` | From the Stripe webhook after a successful subscription mutation. The only billing event (no invoice / payment events). |

NOT emitted: anything LinkedIn-send / connection-accept related.

## Envelope + signing

Envelope (same stable shape as the generic outbound webhooks):
`{id, type, created_at, workspace_id, data}`. `id` is the stable
dedup id — Zapier instant triggers do not dedup, so receivers key on
it, and the outbox stores it UNIQUE so a redelivered event is never
enqueued twice.

Signing reuses the HMAC-SHA256 scheme (`X-NxtSend-Signature:
t=<ts>,v1=<hex>` + `X-NxtSend-Timestamp`, 5-min tolerance) — honest
note: **Zapier does not document verifying these headers on REST
Hook deliveries**; the signature is for receivers that do verify,
and for our own delivery-log integrity.

## Delivery — read this before promising anything

Outbox pattern. The mutation enqueues (synchronously, never failing
the mutation) and a best-effort **immediate** attempt is made with
an 8s timeout. Failures stay in the outbox for the
`zapier_webhook_retry` job (exponential backoff 5m → 30m, max 3
attempts, then `dead` — dead-letter rows are kept for inspection).
The job runs on the **daily 06:00 cron**, so a failed delivery may
wait **up to ~24h** for its next retry. **Do not claim instant
guaranteed delivery.** A 410 from Zapier deactivates the
subscription (the Zap is gone). Stale subscriptions (inactive > 30
days) are removed by the job.

## Storage

Migration 025: `zapier_webhook_subscriptions` and
`zapier_webhook_deliveries`, RLS enabled with ZERO policies —
service-role only. The admin Zapier panel
(`/admin/integrations/zapier`) reads them through the service role
and never selects the subscription secret or delivery payloads.

## Emission coverage

Dashboard browser mutations emit via the decorators → browser
notifier → `POST /api/integrations/zapier/emit` (session-auth,
workspace from the session); Zapier API mutations emit server-side
from the route handlers; the Stripe webhook and the dashboard reply
route emit server-side too. **MCP-tool mutations and
scheduled-reply sends do not emit yet** (no seam was added to the
MCP adapter by design — that adapter is shared by three platforms
and was left untouched).
