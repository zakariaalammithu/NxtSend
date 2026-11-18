# Discord — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Discord account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Send NxtSend alerts to a Discord channel via a channel webhook (POST /api/v10/webhooks/{id}/{token}) — one-way, no bot account needed
- Config-ready: no live Discord webhook has been connected from this environment; delivery is mock-tested only

## Auth

- Auth type: `webhook`
- API base URL: `https://discord.com/api/v10`
- Docs: [Discord docs](https://discord.com/developers/docs/resources/webhook)

## Setup

1. In Discord: Server Settings → Integrations → Webhooks → New Webhook → pick the channel → Copy Webhook URL (you need Manage Webhooks).
2. Store the webhook URL in the NxtSend Discord connection — it is encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | Required | Channel webhook URL (https://discord.com/api/webhooks/<id>/<token>). Secret — store encrypted in the connection's extra bag, never in code. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Discord adapter — sends NxtSend alerts to a Discord channel via
a channel webhook.

Verified endpoint (Discord developer docs, checked 2026-11-19):
  POST https://discord.com/api/v10/webhooks/{webhook.id}/{webhook.token}?wait=true
  Body { content } (max 2,000 characters). 204 No Content without
  ?wait=true; 200 + the created message (incl. id) with it.
The webhook URL is the credential: anyone holding it can post as
the webhook, so it is stored encrypted and never logged.
```

## Honesty notes

- Config-ready: no live Discord webhook has been connected from this environment; delivery is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
