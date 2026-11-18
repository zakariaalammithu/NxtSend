# Google Calendar — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Google Calendar account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Schedule follow-up events for interested leads (events.insert) and list upcoming events, with the lead's details in the event description
- Reuses the existing Google OAuth connection — the calendar.events scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live calendar has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://www.googleapis.com/calendar/v3`
- Docs: [Google Calendar docs](https://developers.google.com/workspace/calendar/api)

## Setup

1. Re-connect Google so the new calendar.events scope is granted.
2. Pick the calendar id (usually 'primary') and a default duration + timezone for follow-ups.
3. Store the calendar id in the NxtSend Google Calendar connection.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Required | Existing Google OAuth client id (already used for Gmail). |
| `GOOGLE_CLIENT_SECRET` | Required | Existing Google OAuth client secret. |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Google Calendar adapter — schedule follow-up events for leads.

Verified endpoints (Google Calendar API v3 docs, checked 2026-11-19):
  POST /calendar/v3/calendars/{calendarId}/events
       Body { summary, description, start: { dateTime, timeZone },
       end: {...}, attendees: [{ email }] }. Response { id,
       htmlLink, ... }.
  GET  /calendar/v3/calendars/{calendarId}/events?timeMin=..&maxResults=..
Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
connection — the calendar.events scope is requested by the
Google OAuth flow (GOOGLE_SCOPES); a stored Gmail-only grant
must re-connect Google before a live connection works.
A calendar holds events, not leads: exportLeads / importLeads are
NOT SUPPORTED (they throw). Scheduling a follow-up is the
supported operation, via createTaskFromLead.
```

## Honesty notes

- Reuses the existing Google OAuth connection — the calendar.events scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live calendar has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
