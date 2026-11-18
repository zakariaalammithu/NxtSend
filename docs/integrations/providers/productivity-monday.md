# Monday.com — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Monday.com account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Export leads to a monday.com board as items (create_item) and import board items, with field mapping and email dedupe — productivity/task use only, NOT the CRM operations
- GraphQL API at api.monday.com/v2 with an API token; column ids are configurable per board
- Config-ready: no live monday.com board has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.monday.com/v2`
- Docs: [Monday.com docs](https://developer.monday.com/api-reference/)

## Setup

1. Create a board with text columns titled: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.
2. Generate an API token (avatar → Administration → API) and copy the board id from its URL.
3. Store the token + board id in the NxtSend Monday.com connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONDAY_API_TOKEN` | Required | API token (avatar → Administration → API, or Developers → My Access Tokens). Sent as the raw Authorization header value. |
| `MONDAY_BOARD_ID` | Required | Board id (numeric). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Monday.com adapter — export leads to a board as items, import
board items. PRODUCTIVITY/TASK use only — NOT the CRM operations
(those belong to the CRM worker's Monday adapter).

Verified (monday.com developer docs, checked 2026-11-19):
  POST https://api.monday.com/v2  (single GraphQL endpoint)
  Header: Authorization: <api token> (raw token, no Bearer) +
  API-Version: 2024-10.
  mutation { create_item(board_id, group_id?, item_name,
    column_values: "<JSON string>") { id } }
  query { boards(ids: [..]) { items_page(limit: 100) { items {
    id name column_values { id text column { title } } } } } }
  query { boards(ids: [..]) { columns { id title } } }
column_values is a JSON STRING whose keys are column ids and whose
values depend on the column type (text columns take a plain
string). The adapter resolves column ids by title on first use,
so no manual column config is needed — but the board must have
text columns titled First Name, Last Name, Email, Company,
Job Title, LinkedIn URL, Tags, Status (missing columns are
skipped, not invented).
```

## Honesty notes

- Export leads to a monday.com board as items (create_item) and import board items, with field mapping and email dedupe — productivity/task use only, NOT the CRM operations
- Config-ready: no live monday.com board has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
