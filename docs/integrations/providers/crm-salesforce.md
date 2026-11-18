# Salesforce — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Salesforce org. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: OAuth 2.0 web-server flow against a Salesforce Connected App.
- Setup → App Manager → New Connected App → enable OAuth settings, add a callback URL, choose scopes `api`, `refresh_token`, `offline_access`.
- The token endpoint (`POST https://login.salesforce.com/services/oauth2/token`) returns an `instance_url` — that per-org URL is the API base and **must** be stored with the credential as `extra.instanceUrl`. There is no single fixed base URL.
- OAuth connect/callback routes are **not implemented** in this stage (the shared OAuth handlers in `src/lib/oauth/handlers.ts` are typed to Google/Microsoft only — extending them is a follow-up owned by the OAuth server work). Until then, complete the flow out of band and store access token + refresh token + `instanceUrl` as the connection credential.
- Tokens are stored encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base = per-org instance URL, API v64.0, verified against developer.salesforce.com)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /services/data/v64.0/limits` |
| Import | `GET /services/data/v64.0/query?q=SELECT Id,FirstName,LastName,Email,AccountId,Title,Description FROM Contact …` |
| Find by email | SOQL `… WHERE Email = '…' LIMIT 1` |
| Create | `POST /services/data/v64.0/sobjects/Contact` |
| Update | `PATCH /services/data/v64.0/sobjects/Contact/{id}` |
| Activity | `POST /services/data/v64.0/sobjects/Task` (`WhoId` = Contact id, `Status` = Completed) |

## Field mapping

| NxtSend | Salesforce Contact field |
|---|---|
| email | `Email` |
| firstName | `FirstName` |
| lastName | `LastName` |
| company | `Account.Name` (read back via `AccountId`; no Account is created) |
| jobTitle | `Title` |
| status | — no field (see below) |

## Sync direction

**Two-way for contacts.** Import reads Contacts via SOQL; export creates or updates a Contact by email lookup. Activity is logged as a completed Task linked to the Contact.

## What is config-ready vs pending

- Implemented: import, export, Task activity logging, connect test, sync-job lifecycle, dedupe.
- NOT implemented: status sync — the Contact object has no status field. Mapping NxtSend status onto the Lead object is a follow-up; the adapter throws a config-ready error instead of writing to a wrong field. Tag sync is likewise not implemented (no native tag field on Contact).
- Pending: live verification against a real org; OAuth connect/callback routes (needs the shared-handler extension); Account create/link for companies.
