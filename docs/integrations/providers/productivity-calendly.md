# Calendly — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Calendly account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- List scheduled events and invitees, and generate a pre-filled scheduling link for a lead — Calendly API v2 cannot create events directly (booking happens on the scheduling link), so lead export is NOT supported
- Authenticates with OAuth 2.0 (or a personal access token for internal use)
- Config-ready: no live Calendly account has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://api.calendly.com`
- Docs: [Calendly docs](https://developer.calendly.com/api-docs)

## Setup

1. Create an OAuth app in the Calendly Developer Portal (or a personal access token for internal use).
2. Copy the user URI (GET /users/me) and the event-type slug from the booking page URL.
3. Store the token + user URI + event-type slug in the NxtSend Calendly connection — encrypted with TOKEN_ENCRYPTION_KEY.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CALENDLY_ACCESS_TOKEN` | Required | OAuth access token or personal access token. |
| `CALENDLY_USER_URI` | Required | User URI, e.g. https://api.calendly.com/users/AAAAAAAAAAAAAAAA. |
| `CALENDLY_EVENT_TYPE_SLUG` | Optional | Event-type slug for the scheduling link, e.g. 30min (the part after calendly.com/<user>/). |
| `CALENDLY_ORGANIZATION_URI` | Optional | Organization URI, for webhook subscriptions (not used by this adapter). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Calendly adapter — list scheduled events + invitees, generate a
pre-filled scheduling link for a lead.

Verified (Calendly API v2 docs, checked 2026-11-19):
  GET /scheduled_events?user={userUri}&min_start_time=..&count=100
  GET /scheduled_events/{uuid}/invitees
  GET /event_types?user={userUri}
  POST /scheduling_links  Body { max_event_count, owner, owner_type }
Auth: OAuth 2.0 (auth.calendly.com/oauth/authorize + /oauth/token)
or a personal access token for internal use. Access tokens expire
after 2 hours — refresh tokens must be used.
HONEST LIMIT: Calendly API v2 cannot create events directly.
Booking happens when the invitee opens a scheduling link. So
exportLeads is NOT SUPPORTED (it throws), and createTaskFromLead
returns the lead's pre-filled scheduling link instead of a task.
Import reads invitees back into leads.
```

## Honesty notes

- List scheduled events and invitees, and generate a pre-filled scheduling link for a lead — Calendly API v2 cannot create events directly (booking happens on the scheduling link), so lead export is NOT supported
- Config-ready: no live Calendly account has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
