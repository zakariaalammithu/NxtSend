# Trello — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Trello account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create follow-up cards from interested leads on a Trello list, and import cards back to leads (best-effort: name + description lines the adapter wrote)
- Authenticates with an API key + token passed as query parameters
- Config-ready: no live Trello board has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.trello.com/1`
- Docs: [Trello docs](https://developer.atlassian.com/cloud/trello/rest/)

## Setup

1. Open trello.com/app-key, copy the API key, then generate a token (it grants access to your account — keep it secret).
2. Copy the target list id (open the list; the id is in the board JSON or via GET /1/boards/{id}/lists).
3. Store the key + token + list id in the NxtSend Trello connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TRELLO_API_KEY` | Required | API key from trello.com/app-key (identifies the app). |
| `TRELLO_TOKEN` | Required | API token from trello.com/app-key (grants access to the account — keep secret). |
| `TRELLO_LIST_ID` | Required | List id the follow-up cards are created in. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Trello adapter — create follow-up cards from leads, import cards.

Verified endpoints (Trello REST API docs, checked 2026-11-19):
  POST /1/cards?key={key}&token={token}&idList={listId}&name=..
       &desc=..&due=..  — auth + fields as QUERY parameters.
  GET  /1/lists/{listId}/cards?key=..&token=..
  PUT  /1/cards/{cardId}?key=..&token=..&idList=..
Auth: API key + token (trello.com/app-key). Trello is rolling out
OAuth 2.0 as opt-in; key+token remains the documented path.
Import is best-effort: it reads back the name + the "Email: /
Company: / ..." lines this adapter writes into card descriptions.
```

## Honesty notes

- Config-ready: no live Trello board has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
