# Telegram Bot — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Telegram Bot account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Send NxtSend alerts to a Telegram chat / group / channel via the Bot API (POST /bot<token>/sendMessage) — bot token from @BotFather, no OAuth
- A bot cannot start a conversation: the user must message the bot first, or the bot must be added to the target group/channel
- Config-ready: no live Telegram bot has been connected from this environment; delivery is mock-tested only

## Auth

- Auth type: `bearer_token`
- API base URL: `https://api.telegram.org`
- Docs: [Telegram Bot docs](https://core.telegram.org/bots/api)

## Setup

1. Message @BotFather in Telegram → /newbot → pick a name and a username ending in 'bot' → copy the token (it is a secret).
2. Start a chat with the bot (or add it to the target group/channel) and send it a message.
3. Read the chat id from GET /bot<token>/getUpdates (message.chat.id).
4. Store the bot token + chat id in the NxtSend Telegram connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Required | Bot token from @BotFather. Secret — store encrypted in the connection's extra bag, never in code. |
| `TELEGRAM_CHAT_ID` | Required | Target chat id (user, group or channel). Get it from getUpdates after the bot receives a message. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Telegram adapter — sends NxtSend alerts via the Telegram Bot API.

Verified endpoints (Telegram Bot API docs, checked 2026-11-19):
  GET  https://api.telegram.org/bot<token>/getMe
  POST https://api.telegram.org/bot<token>/sendMessage
    Body { chat_id, text } (text 1–4096 chars). Every call is
    https://api.telegram.org/bot<token>/METHOD — the token in the
    path IS the authentication (there is no header/OAuth form),
    so the token never appears in a log line here: the
    ProviderHttpClient redacts Bearer patterns, and this adapter
    never logs the request URL.
A bot cannot start a conversation: the user must message the bot
first, or the bot must be added to the target group/channel.
```

## Honesty notes

- A bot cannot start a conversation: the user must message the bot first, or the bot must be added to the target group/channel
- Config-ready: no live Telegram bot has been connected from this environment; delivery is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
