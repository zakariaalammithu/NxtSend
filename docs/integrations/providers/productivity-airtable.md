# Airtable — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Airtable account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Export leads to an Airtable table (up to 10 records per request, chunked) and import records, with field mapping and email dedupe
- Authenticates with a personal access token (legacy API keys were shut off 1 Feb 2024); scopes data.records:read / data.records:write
- Config-ready: no live Airtable base has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.airtable.com/v0`
- Docs: [Airtable docs](https://airtable.com/developers/web/api/introduction)

## Setup

1. Create a personal access token (Airtable account → Developer → Personal access tokens) with data.records:read + data.records:write on the target base.
2. Create a table with fields: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.
3. Copy the base id + table id from the base's API documentation page.
4. Store the token + base/table ids in the NxtSend Airtable connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AIRTABLE_PAT` | Required | Personal access token with data.records:read + data.records:write on the target base. |
| `AIRTABLE_BASE_ID` | Required | Base id (app…). |
| `AIRTABLE_TABLE_ID` | Required | Table id or name (prefer the id — renames do not break it). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Airtable adapter — export leads to a table, import records.

Verified endpoints (Airtable Web API docs, checked 2026-11-19):
  GET  /v0/{baseId}/{tableIdOrName}?pageSize=100&offset=...
  POST /v0/{baseId}/{tableIdOrName}  Body { records: [{ fields }] }
       — up to 10 records per request; response { records: [{ id,
       createdTime, fields }] }.
  PATCH /v0/{baseId}/{tableIdOrName}/{recordId}  Body { fields }
Auth: Bearer personal access token (legacy account API keys were
shut off 1 Feb 2024). Scopes data.records:read / data.records:write.
Rate limit: 5 requests/second per base — the client retries 429s.
```

## Honesty notes

- Config-ready: no live Airtable base has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
