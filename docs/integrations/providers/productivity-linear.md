# Linear — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Linear account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create follow-up issues from interested leads in a Linear team (issueCreate) and import issues, with field mapping
- GraphQL API at api.linear.app/graphql with a personal API key or OAuth token
- Config-ready: no live Linear workspace has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `api_key`
- API base URL: `https://api.linear.app/graphql`
- Docs: [Linear docs](https://linear.app/developers)

## Setup

1. Generate a personal API key (Linear Settings → API).
2. Copy the team id (Settings → Teams → the team's UUID).
3. Store the key + team id in the NxtSend Linear connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `LINEAR_API_KEY` | Required | Personal API key from Linear Settings → API (or an OAuth access token). |
| `LINEAR_TEAM_ID` | Required | Team UUID the follow-up issues are created in. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Linear adapter — create follow-up issues from leads, import issues.

Verified (Linear developer docs, checked 2026-11-19):
  POST https://api.linear.app/graphql  (single GraphQL endpoint)
  mutation { issueCreate(input: { teamId, title, description,
    priority?, labelIds?, assigneeId? }) { success issue { id
    identifier title url } } }
  query { issues(first: 100) { nodes { id identifier title
    description url team { id } } } } — filtered client-side by
    team id (no server-side filter syntax is assumed here).
Auth: Bearer personal API key (Settings → API) or OAuth token.
Rate limit: 1,500 requests/hour for personal API keys.
```

## Honesty notes

- Config-ready: no live Linear workspace has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
