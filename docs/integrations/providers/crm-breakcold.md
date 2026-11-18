# Breakcold — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Breakcold workspace. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: API key (Bearer) or OAuth, with scopes `records:read`, `records:write`, `notes:read`, `notes:write`.
- In Breakcold: Settings → API key → create a key with the records + notes scopes. Store the key as the connection credential (`apiKey`) and the **workspaceId** as `extra.workspaceId` (`GET /workspaces` lists them). Both are stored encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.
- Cost: every successful read costs 0.2 Breakcold tokens, every write 0.4; `GET /workspaces` is free. High-volume syncs spend tokens — the adapter pages at 100 records per call.

## Endpoints used (base `https://rest.breakcold.com/api/v1`, verified against the official OpenAPI 3.1 contract at docs.breakcold.com/api/openapi.json)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /workspaces` (free) |
| Import | `GET /records?workspaceId=&objectTypeSlug=person&limit=` |
| Find by email | `GET /records?workspaceId=&objectTypeSlug=person&search=<email>&searchScope=all` |
| Create | `POST /records` (`{workspaceId, objectTypeSlug: "person", fields}`) |
| Update | `PATCH /records/{recordId}` (`{fields}`) |
| Note | `POST /records/{recordId}/notes` (`{title, content}`) |
| (also verified) | `GET /records/{recordId}`, `POST /records/{recordId}/archive`, `GET /records/{recordId}/notes`, `GET /crm/objects?workspaceId=` |

## Field mapping

Records are typed by object; this adapter uses the standard `person` object (`objectTypeSlug: "person"`, as in the OpenAPI create-record example).

| NxtSend | Breakcold record field |
|---|---|
| firstName + lastName | `fields.name` |
| email | `fields.email` |
| company | `fields.company` (workspace field — confirm the slug) |
| jobTitle | `fields.job_title` (workspace field — confirm the slug) |

## Sync direction

**Two-way for person records.** Import lists person records in the workspace into NxtSend leads (deduped by email); export creates or updates a person record by email search. Notes attach to the record. There is no permanent delete in v1 (archive/restore instead) — the adapter never deletes.

## What is config-ready vs pending

- Implemented: import, export, note sync, connect test, sync-job lifecycle, dedupe.
- CONFIG-READY ONLY: status sync and tag sync — Breakcold records have no standard status/tag field; the workspace's stage/tag field slug must be configured first. Both throw config-ready errors.
- Pending: live verification against a real workspace; confirming the company/job-title field slugs for that workspace's person object.
