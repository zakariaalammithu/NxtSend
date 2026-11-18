# HubSpot — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real HubSpot account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: OAuth 2.0 access token **or** a private-app access token, sent as `Authorization: Bearer <token>`.
- Private app (fastest path): HubSpot → Settings → Integrations → Private Apps → Create a private app, with scopes `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.companies.write`. Copy the access token.
- OAuth app: register an app in the HubSpot developer portal; the OAuth connect/callback routes are **not implemented** in this stage (the shared OAuth handlers in `src/lib/oauth/handlers.ts` are typed to Google/Microsoft only — extending them is a follow-up owned by the OAuth server work). Until then, connect with a private-app token.
- The token is stored encrypted in `integration_connections` (migration 030) via `upsertProviderConnection`. No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base `https://api.hubapi.com`, verified against developers.hubspot.com)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /account-info/v3/details` |
| Import | `GET /crm/v3/objects/contacts?properties=…&limit=&after=` (paged) |
| Find by email | `POST /crm/v3/objects/contacts/search` |
| Create | `POST /crm/v3/objects/contacts` |
| Update | `PATCH /crm/v3/objects/contacts/{id}` |
| Note | `POST /crm/v3/objects/notes` (inline association, type 202 `note_to_contact`) |

## Field mapping

| NxtSend | HubSpot contact property |
|---|---|
| email | `email` (required) |
| firstName | `firstname` |
| lastName | `lastname` |
| company | `company` |
| jobTitle | `jobtitle` |
| linkedinUrl | `hs_linkedin_url` |
| status | `lifecyclestage` (see below) |

## Sync direction

**Two-way.** Import reads contacts into NxtSend leads (deduped by email); export creates or updates a contact by email lookup. Status sync writes `lifecyclestage`: `new`/`contacted`/`unresponsive` → `lead`, `replied` → `salesqualifiedlead`, `converted` → `customer`. Notes are created with an inline `note_to_contact` association (type 202).

## What is config-ready vs pending

- Implemented: import, export, status sync, note sync, connect test, sync-job lifecycle, dedupe.
- NOT implemented: tag sync — HubSpot contacts have no native tag field; the adapter throws an explicit error instead of pretending.
- Pending: live verification against a real account; OAuth connect/callback routes (needs the shared-handler extension).
