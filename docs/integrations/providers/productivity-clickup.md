# ClickUp — NxtSend integration

> Status: **config-ready, mock-tested only.** No live ClickUp account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create follow-up tasks from interested leads in a ClickUp list, and import tasks back to leads (best-effort: name + description lines the adapter wrote)
- Authenticates with a personal API token (Bearer); one request per task (no bulk create endpoint)
- Config-ready: no live ClickUp list has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.clickup.com/api/v2`
- Docs: [ClickUp docs](https://developer.clickup.com/reference)

## Setup

1. Copy a personal API token (ClickUp Settings → Apps → API Token).
2. Copy the target list id from the list URL (the number after /li/).
3. Store the token + list id in the NxtSend ClickUp connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CLICKUP_API_TOKEN` | Required | Personal API token (pk_…) from Settings → Apps → API Token. |
| `CLICKUP_LIST_ID` | Required | List id the follow-up tasks are created in (numeric id in the list URL). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
ClickUp adapter — create follow-up tasks from leads, import tasks.

Verified endpoints (ClickUp API v2 docs, checked 2026-11-19):
  POST /api/v2/list/{list_id}/task  Body { name, description,
       assignees?, due_date? (unix ms) } — response { id, url }.
  GET  /api/v2/list/{list_id}/task?archived=false
  PUT  /api/v2/task/{task_id}
Auth: Bearer personal API token (Settings → Apps → API Token) or
OAuth. ClickUp has no bulk-create endpoint — one request per task.
Import is best-effort: it reads back the name + the "Email: /
Company: / ..." lines this adapter writes into task descriptions.
```

## Honesty notes

- Config-ready: no live ClickUp list has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
