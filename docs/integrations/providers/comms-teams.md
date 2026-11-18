# Microsoft Teams — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Microsoft Teams account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Send NxtSend alerts to a Teams channel via a Teams Workflows webhook (the Office 365 Connector / incoming-webhook path is deprecated — new webhooks must be created as Workflows)
- Microsoft Graph channel-message sending is NOT implemented: Graph application permissions cannot send channel messages (delegated ChatMessage.Send / ChannelMessage.Send only), so the webhook is the supported path
- Config-ready: no live Teams webhook has been connected from this environment; delivery is mock-tested only

## Auth

- Auth type: `webhook`
- No fixed base URL — the provider URL is stored per workspace (e.g. a webhook URL).
- Docs: [Microsoft Teams docs](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors)

## Setup

1. In Teams, open the target channel → … → Workflows → pick the 'Post to a channel when a webhook request is received' template (or build one from the webhook trigger).
2. Copy the webhook URL the workflow issues (it is a secret).
3. In the workflow, map the incoming 'text' field into the message the workflow posts — the adapter sends { text: '<title>\n<body>' }.
4. Store the webhook URL in the NxtSend Teams connection — it is encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TEAMS_WEBHOOK_URL` | Required | Teams Workflows webhook URL for the target channel. Secret — store encrypted in the connection's extra bag, never in code. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Microsoft Teams adapter — sends NxtSend alerts to a Teams channel
via a Teams Workflows webhook.

Verified (Microsoft Learn + Teams docs, checked 2026-11-19):
  - Office 365 Connectors / classic incoming webhooks are deprecated;
    new webhooks are created as a Teams Workflow ("When a Teams webhook
    request is received" trigger), which issues a webhook URL. POST
    JSON to that URL; the workflow posts it to the channel.
  - The payload shape the workflow expects depends on the workflow
    template the operator picks: this adapter sends { text } and the
    workflow must map the "text" field into its "Post card / Post
    message" action. That mapping is a per-workspace setup step —
    see docs/integrations/providers/comms-teams.md.
  - Microsoft Graph channel sends are NOT implemented on purpose:
    Graph application permissions cannot send channel messages
    (delegated ChatMessage.Send / ChannelMessage.Send only), so the
    webhook is the supported path for a service integration.
```

## Honesty notes

- Send NxtSend alerts to a Teams channel via a Teams Workflows webhook (the Office 365 Connector / incoming-webhook path is deprecated — new webhooks must be created as Workflows)
- Microsoft Graph channel-message sending is NOT implemented: Graph application permissions cannot send channel messages (delegated ChatMessage.Send / ChannelMessage.Send only), so the webhook is the supported path
- Config-ready: no live Teams webhook has been connected from this environment; delivery is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
