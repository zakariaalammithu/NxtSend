# Pipedrive — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Pipedrive account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: OAuth 2.0 access token, sent as `Authorization: Bearer <token>`.
- Register an app in the Pipedrive Developer Hub and complete the OAuth flow. (Pipedrive also documents a legacy per-user API token; this adapter uses OAuth only.)
- The token is stored encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base `https://api.pipedrive.com/v1`, verified against developers.pipedrive.com)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /users/me` |
| Import | `GET /persons?limit=&start=` (paged via `additional_data.pagination`) |
| Find by email | `GET /persons/search?term=&fields=email&exact_match=true` |
| Create | `POST /persons` |
| Update | `PUT /persons/{id}` |
| Note | `POST /notes` (`content`, `person_id`) |
| Activity | `POST /activities` (`subject`, `type: "note"`, `note`, `participants: [{person_id, primary: true}]`) |

Notes on the API shape: every response is wrapped in `{ success, data }`; the adapter unwraps `data` and treats `success: false` as an error. On activity create the `person_id` field is read-only — the person is set via the `participants` array with a primary participant.

## Field mapping

| NxtSend | Pipedrive person |
|---|---|
| email | `email[].value` (primary) |
| firstName + lastName | `name` |
| company | `org_id` — the organisation must already exist in Pipedrive; no org is created |
| jobTitle | — no standard person field |

## Sync direction

**Two-way for persons.** Import reads persons into NxtSend leads (deduped by email); export creates or updates a person by email search. Notes and note-type activities are written against the person.

## What is config-ready vs pending

- Implemented: import, export, note sync, activity logging, connect test, sync-job lifecycle, dedupe.
- NOT implemented: status sync — Pipedrive persons have no status field (deal-stage sync is a follow-up); tag sync — persons have no native tag field. Both throw explicit errors.
- Pending: live verification against a real account; organisation create/link for companies.
