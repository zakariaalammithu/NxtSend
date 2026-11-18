# Slack — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Slack account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Send NxtSend alerts (new lead, new reply, interested lead, campaign status, daily report, sync error) to a Slack channel
- Two delivery paths: incoming webhook (one URL per channel) or bot token + chat.postMessage (chat:write) — webhook is the default
- Config-ready: no live Slack workspace has been connected from this environment; delivery is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://slack.com/api`
- Docs: [Slack docs](https://docs.slack.dev/)

## Setup

1. Create a Slack app at api.slack.com/apps.
2. Enable Incoming Webhooks and add a webhook for the target channel — copy the URL (it is a secret).
3. OR add the chat:write bot scope, install the app, and copy the bot token (xoxb-…) plus the channel id.
4. Store the webhook URL (or bot token + channel id) in the NxtSend Slack connection — it is encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Optional | Incoming-webhook URL for the target channel. Secret — store encrypted in the connection's extra bag, never in code. |
| `SLACK_BOT_TOKEN` | Optional | Bot token (xoxb-…) with chat:write, for chat.postMessage delivery when no webhook is stored. |
| `SLACK_CHANNEL_ID` | Optional | Channel id (C…) for chat.postMessage delivery. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Slack adapter — sends NxtSend alerts to a Slack channel.

Verified endpoints (Slack developer docs, checked 2026-11-19):
  POST https://hooks.slack.com/services/<id>  (incoming webhook — one URL
    per channel; the URL itself is the credential; answers "ok")
  POST https://slack.com/api/chat.postMessage (bot token, chat:write scope;
    returns { ok, ts }; channel id required)
Webhook is the default path; chat.postMessage is used only when no
webhook URL is stored and a bot token + channel id are.
```

## Honesty notes

- Config-ready: no live Slack workspace has been connected from this environment; delivery is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
