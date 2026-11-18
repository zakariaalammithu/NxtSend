# Google Sheets — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Google Sheets account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Export leads to a sheet (values.append) and import leads from a sheet (values.get), with field mapping and email dedupe
- Reuses the existing Google OAuth connection — the spreadsheets scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live sheet has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://sheets.googleapis.com/v4`
- Docs: [Google Sheets docs](https://developers.google.com/workspace/sheets/api)

## Setup

1. Re-connect Google so the new spreadsheets scope is granted (the stored Gmail-only grant cannot call Sheets).
2. Create a sheet with the header row: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.
3. Share the sheet with the connected Google account (or create it in that account).
4. Store the spreadsheet id + range (e.g. Leads!A1:H) in the NxtSend Google Sheets connection.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Required | Existing Google OAuth client id (already used for Gmail). |
| `GOOGLE_CLIENT_SECRET` | Required | Existing Google OAuth client secret. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Required | Target spreadsheet id (the long id in the sheet URL). |

> Values are never committed: they live in the encrypted connection store
> (`integration_connections.encrypted_credentials`, AES-256-GCM via
> `TOKEN_ENCRYPTION_KEY`) or the deployment environment.

## Endpoints & behaviour

```
Google Sheets adapter — export leads to a sheet, import leads
from a sheet.

Verified endpoints (Google Sheets API v4 docs, checked 2026-11-19):
  GET  /v4/spreadsheets/{spreadsheetId}/values/{range}
  POST /v4/spreadsheets/{spreadsheetId}/values/{range}:append
       ?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS
       Body { values: [[...]] }. Response { updates: { updatedRows,
       updatedRange } }.
  PUT  /v4/spreadsheets/{spreadsheetId}/values/{range}
Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
connection (src/lib/oauth/google.ts) — the spreadsheets scope
is requested by the Google OAuth flow (GOOGLE_SCOPES); a stored
Gmail-only grant must re-connect Google before a live connection
works. Until then this adapter reports
credentials/configuration errors honestly.
The target sheet must already have the header row
(First Name, Last Name, Email, Company, Job Title, LinkedIn URL,
Tags, Status) — export appends data rows below it.
```

## Honesty notes

- Reuses the existing Google OAuth connection — the spreadsheets scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live sheet has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
