# Close — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Close account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: API key via HTTP Basic Auth — the key is the username, the password is empty (`Authorization: Basic base64(<api_key> + ":")`).
- In Close: Settings → API Keys → create a key (shown once). Store it as the connection credential (`apiKey`), encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base `https://api.close.com/api/v1`, verified against developer.close.com)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /me/` |
| Import | `GET /lead/?_limit=&_skip=` (paged) |
| Create | `POST /lead/` (`name`, nested `contacts: [{name, emails: [{email}]}]`) |
| Update | `PUT /lead/{id}/` |
| Status lookup | `GET /lead_status/` |
| Note | `POST /activity/note/` (`lead_id`, `note`) |

## Field mapping

Close's model differs from the others: a **lead** is a company/organisation and **contacts** are people inside it. A NxtSend lead maps to a Close lead named after the company (or the person, when no company is given) with one nested contact.

| NxtSend | Close |
|---|---|
| company (or person name) | `lead.name` |
| firstName + lastName | `lead.contacts[].name` |
| email | `lead.contacts[].emails[].email` |
| jobTitle | `lead.contacts[].title` |
| status | lead `status_id` (looked up by label first) |

## Sync direction

**Two-way.** Import reads leads with their nested contacts (one NxtSend lead per contact); export creates or updates a lead, finding the existing lead by matching a nested contact email (Close has no direct find-contact-by-email endpoint, so the adapter pages the lead list and matches client-side). Status sync looks the status label up via `GET /lead_status/` and then PUTs the `status_id`. Notes are created as note activities on the lead.

## What is config-ready vs pending

- Implemented: import, export, status sync, note sync, connect test, sync-job lifecycle, dedupe.
- NOT implemented: tag sync — Close leads have no native tag field; the adapter throws an explicit error.
- Pending: live verification against a real account.
