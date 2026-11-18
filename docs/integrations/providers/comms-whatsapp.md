# WhatsApp Business Platform — NxtSend integration

> Status: **config-ready, mock-tested only.** No live WhatsApp Business Platform account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Send NxtSend alerts via the official Meta WhatsApp Business Cloud API only (POST /v21.0/{phone-number-id}/messages) — no unofficial workarounds
- Business-initiated messages outside the 24-hour customer-service window must use a Meta-approved template; free-form text only works inside an open window
- CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a registered business number and a permanent system-user token — none of which exists in this environment; delivery is mock-tested only

## Auth

- Auth type: `bearer_token`
- API base URL: `https://graph.facebook.com/v21.0`
- Docs: [WhatsApp Business Platform docs](https://developers.facebook.com/docs/whatsapp/cloud-api)

## Setup

1. Create a Business-type Meta app, add the WhatsApp product, and register a business phone number (verify it by SMS/voice). Note the Phone Number ID and WhatsApp Business Account ID.
2. Create a system user in the business portfolio, assign it the app + WABA, and generate a permanent token with whatsapp_business_messaging.
3. Create (and wait for Meta approval of) a message template for alerts, or use the built-in hello_world sample for testing.
4. The recipient must have opted in; free-form text only delivers inside the 24-hour window opened by the recipient messaging you.
5. Store the token, phone number id, recipient and template name in the NxtSend WhatsApp connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Required | Permanent system-user access token with whatsapp_business_messaging. Secret — store encrypted, never in code. (The temporary dashboard token lasts ~24h and is testing-only.) |
| `WHATSAPP_PHONE_NUMBER_ID` | Required | Phone number id of the registered business sender number (not the phone number itself). |
| `WHATSAPP_RECIPIENT` | Required | Recipient number in E.164 without '+', e.g. 14155551234. |
| `WHATSAPP_TEMPLATE_NAME` | Optional | Meta-approved template for business-initiated alerts (default: hello_world). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
WhatsApp adapter — sends NxtSend alerts via the OFFICIAL Meta
WhatsApp Business Cloud API only.

Verified endpoint (Meta WhatsApp Cloud API docs, checked 2026-11-19):
  POST https://graph.facebook.com/v21.0/{phone-number-id}/messages
  Bearer <system-user token>. Body { messaging_product: "whatsapp",
  to, type: "template" | "text", ... }. 200 returns
  { messages: [{ id }] } (accepted, not delivered).
No unofficial workarounds, no green-API-style hacks: the On-Premises
API was sunset 23 Oct 2025, so the Cloud API is the only supported
path. Business-initiated messages outside the 24-hour customer
service window MUST use a Meta-approved template — free-form text
fails with error 131047 — so the default mode is "template" and
the template name is configurable. Text mode is offered only for
replies inside an open window, and the adapter surfaces Meta's
131047 failure honestly instead of hiding it.
CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a
registered business number (phone number id), an approved template
and a permanent system-user token with whatsapp_business_messaging.
None of that exists in this environment.
```

## Honesty notes

- CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a registered business number and a permanent system-user token — none of which exists in this environment; delivery is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
