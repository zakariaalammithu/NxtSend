# Notion — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Notion account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Export leads to a Notion database (create page, upsert by email) and import database rows, with field mapping and email dedupe
- Authenticates with an internal integration secret (Bearer token) + Notion-Version header; the database must be shared with the integration
- Config-ready: no live Notion database has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.notion.com/v1`
- Docs: [Notion docs](https://developers.notion.com/reference/intro)

## Setup

1. Create an internal integration in Notion and copy its secret.
2. Create a database with properties: Name (title), Email (email), Company (rich_text), Job Title (rich_text), LinkedIn URL (url), Tags (multi_select), Status (select).
3. Share the database with the integration (… → Add connections).
4. Store the secret + database id in the NxtSend Notion connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NOTION_TOKEN` | Required | Internal integration secret (ntn_… / secret_…). Create the integration in Notion → Settings → Connections, then share the target database with it. |
| `NOTION_DATABASE_ID` | Required | Database id (from the database URL). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Notion adapter — export leads to a database, import rows.

Verified endpoints (Notion API docs, checked 2026-11-19):
  POST /v1/pages  Body { parent: { database_id }, properties }
  POST /v1/databases/{database_id}/query  Body { filter?, sorts?,
       start_cursor?, page_size? }
  PATCH /v1/pages/{page_id}  Body { properties }
Every request carries Authorization: Bearer <secret> + the
required Notion-Version header (pinned to 2022-06-28, the
long-stable version cited across Notion's docs).
Auth: internal integration secret. The database must be shared
with the integration or every call 404s. Property names must
match the database schema: Name (title), Email (email), Company
(rich_text), Job Title (rich_text), LinkedIn URL (url), Tags
(multi_select), Status (select).
```

## Honesty notes

- Config-ready: no live Notion database has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
