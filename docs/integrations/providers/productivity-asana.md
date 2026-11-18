# Asana — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Asana account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create follow-up tasks from interested leads in an Asana project, and import tasks back to leads (best-effort: name + description lines the adapter wrote)
- Authenticates with a personal access token (Bearer) or OAuth; task creation requires the tasks:write scope
- Config-ready: no live Asana project has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://app.asana.com/api/1.0`
- Docs: [Asana docs](https://developers.asana.com/reference/rest-api-reference)

## Setup

1. Generate a personal access token (Asana Developer Console → Personal access tokens) or set up OAuth.
2. Copy the project gid from the project URL (app.asana.com/0/<gid>/list).
3. Store the token + project gid in the NxtSend Asana connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ASANA_ACCESS_TOKEN` | Required | Personal access token (Developer Console → Personal access tokens) or OAuth access token, with tasks:write. |
| `ASANA_PROJECT_GID` | Required | Project gid the follow-up tasks are created in. |
| `ASANA_WORKSPACE_GID` | Optional | Workspace gid (required when creating a task without a project). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Asana adapter — create follow-up tasks from leads, import tasks.

Verified endpoints (Asana API docs, checked 2026-11-19):
  POST /tasks  Body { data: { name, notes, projects: [gid],
       workspace: gid, due_on?, assignee? } } — response
       { data: { gid, permalink_url, ... } }. Scope tasks:write.
  GET  /tasks?project={gid}&opt_fields=name,notes,completed,...
  PUT  /tasks/{gid}  Body { data: {...} }
Auth: Bearer personal access token or OAuth token. Asana has no
bulk-create endpoint — one request per task. Export = one task
per lead in the configured project. Import is best-effort: it
reads back the name + the "Email: / Company: / Job title: /
LinkedIn:" lines this adapter writes into task notes.
```

## Honesty notes

- Config-ready: no live Asana project has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
