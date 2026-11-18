# Jira — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Jira account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create follow-up issues from interested leads in a Jira Cloud project (ADF description) and import issues via JQL search, with field mapping
- Authenticates with email + API token (Basic auth); Jira Cloud only — Data Center uses the v2 API and is not covered
- Config-ready: no live Jira site has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- No fixed base URL — the provider URL is stored per workspace (e.g. a webhook URL).
- Docs: [Jira docs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)

## Setup

1. Generate an API token (Atlassian account → Security → API tokens).
2. Note the site subdomain (https://<site>.atlassian.net) and the target project key.
3. Store the email + token + site + project key in the NxtSend Jira connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `JIRA_SITE_DOMAIN` | Required | Site subdomain, e.g. acme (for https://acme.atlassian.net). |
| `JIRA_EMAIL` | Required | Atlassian account email used for Basic auth. |
| `JIRA_API_TOKEN` | Required | API token from Atlassian account security settings (passwords have not worked for Cloud since 2019). |
| `JIRA_PROJECT_KEY` | Required | Project key, e.g. OPS. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Jira adapter — create follow-up issues from leads (Jira Cloud),
import issues via JQL search.

Verified endpoints (Atlassian Jira Cloud REST API v3 docs, checked
2026-11-19):
  POST /rest/api/3/issue  Body { fields: { project: { key },
       issuetype: { name: "Task" }, summary, description: <ADF> } }
       — 201 Created { id, key, self }. Rich text MUST be
       Atlassian Document Format (plain strings are rejected).
  GET  /rest/api/3/search/jql?jql=...&fields=...&maxResults=100
       — the legacy /rest/api/3/search endpoint was removed from
       Cloud; pagination uses nextPageToken.
  GET  /rest/api/3/myself — auth check.
Auth: Basic base64(email:api_token). Jira Cloud only — Data Center
uses the v2 API and is not covered. Base URL is per-site:
https://{site}.atlassian.net/rest/api/3.
```

## Honesty notes

- Authenticates with email + API token (Basic auth); Jira Cloud only — Data Center uses the v2 API and is not covered
- Config-ready: no live Jira site has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
