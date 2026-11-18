# GoHighLevel — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real GoHighLevel account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: Private Integration Token **or** OAuth 2.0 access token, sent as `Authorization: Bearer <token>`, **plus a required `Version: 2021-07-28` header on every request** (a missing Version header is a 400 — the most common first-call failure).
- API v1 is deprecated (end of support 2025-12-31); this adapter uses API v2 only.
- In the sub-account: Settings → Integrations → Private Integrations → create one with scopes `contacts.readonly` + `contacts.write`. Store the token as the connection credential (`accessToken`) and the sub-account **locationId** as `extra.locationId` — nearly every contact call requires it. Both are stored encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base `https://services.leadconnectorhq.com`, verified against the HighLevel API v2 reference)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /contacts/?locationId=&limit=1` |
| Import | `GET /contacts/?locationId=&limit=` |
| Find by email | `POST /contacts/search` (`locationId`, `query`) |
| Create | `POST /contacts/` (`locationId`, `firstName`, `lastName`, `email`, `companyName`, `tags`) |
| Update | `PUT /contacts/{contactId}` |

## Field mapping

| NxtSend | GoHighLevel contact |
|---|---|
| email | `email` |
| firstName | `firstName` |
| lastName | `lastName` |
| company | `companyName` |
| tags | `tags[]` |
| status | `nxtsend:<status>` tag (see below) |

## Sync direction

**Two-way for contacts.** Import reads contacts for the location into NxtSend leads (deduped by email); export creates or updates a contact by email search. Status has no dedicated field, so status sync writes a namespaced tag (`nxtsend:converted`, etc.) on the contact via the verified contact-update path, replacing any previous `nxtsend:*` tag.

## What is config-ready vs pending

- Implemented: import, export, status-via-tag sync, tag sync (via the verified contact-update path), connect test, sync-job lifecycle, dedupe.
- CONFIG-READY ONLY (no request is sent): the dedicated contact-notes endpoint and the dedicated tag add/remove endpoints — their exact v2 paths were not verified against the official reference in this pass, so the adapter throws a config-ready error for note sync instead of guessing a URL.
- Pending: live verification against a real account; confirming the notes/tag endpoint paths against the official reference.
