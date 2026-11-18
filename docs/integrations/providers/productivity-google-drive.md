# Google Drive — NxtSend integration

> Status: **config-ready, mock-tested only.** No live Google Drive account has been
> connected from this environment. Nothing in this document claims a live
> connection — a connection is only "connected" after a real authenticated
> check or a successful delivery/sync.

## What it does

- Create a NxtSend Leads spreadsheet file in Drive, list Drive files, and import leads by exporting a sheet as CSV
- File-content upload (multipart / resumable) is NOT implemented: ProviderHttpClient sends JSON bodies only, so raw-byte upload has no transport in the engine
- Reuses the existing Google OAuth connection — the drive.file scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live Drive account has been connected from this environment; sync is mock-tested only

## Auth

- Auth type: `oauth2`
- API base URL: `https://www.googleapis.com/drive/v3`
- Docs: [Google Drive docs](https://developers.google.com/workspace/drive/api)

## Setup

1. Re-connect Google so the new drive.file scope is granted.
2. Export creates a spreadsheet file in Drive; use the Google Sheets adapter (same connection) to fill its rows.
3. For import, store the spreadsheet file id in the connection settings.

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
Google Drive adapter — create a NxtSend Leads spreadsheet file,
list Drive files, import leads by exporting a sheet as CSV.

Verified endpoints (Google Drive API v3 docs, checked 2026-11-19):
  GET  /drive/v3/files?q=...&fields=files(id,name,mimeType,webViewLink)
  POST /drive/v3/files  Body { name, mimeType } — creates a file
       (mimeType application/vnd.google-apps.spreadsheet creates
       an empty spreadsheet; content upload is a SEPARATE media
       endpoint and is NOT implemented — see below)
  GET  /drive/v3/files/{fileId}/export?mimeType=text/csv
Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
connection — the drive.file scope is requested by the Google
OAuth flow (GOOGLE_SCOPES); a stored Gmail-only grant must
re-connect Google before a live connection works.
NOT IMPLEMENTED, honestly: file-content upload. ProviderHttpClient
sends JSON bodies only, and Drive content upload needs multipart /
resumable media upload (POST https://www.googleapis.com/upload/
drive/v3/files). So exportLeads creates the spreadsheet FILE and
the Google Sheets adapter fills its rows — the two adapters are
designed to be used together.
```

## Honesty notes

- File-content upload (multipart / resumable) is NOT implemented: ProviderHttpClient sends JSON bodies only, so raw-byte upload has no transport in the engine
- Reuses the existing Google OAuth connection — the drive.file scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works
- Config-ready: no live Drive account has been connected from this environment; sync is mock-tested only

## What is NOT built

- No live-connection check is claimed: `checkConfiguration()` in the
  adapter is a stored-state check only. A "connected" status must come
  from a real authenticated call or a successful delivery/sync.
- No LinkedIn-send/accept anywhere in this integration.
- No second audit system: delivery/sync results are returned to the
  caller, which records sync jobs in `integration_sync_jobs`
  (migration 030). `recordPlatformAudit` is Zapier/n8n-only and does
  not fit these providers.
