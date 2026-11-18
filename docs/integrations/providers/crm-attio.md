# Attio — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Attio workspace. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: workspace access token (API key), sent as `Authorization: Bearer <token>`. (OAuth 2.0 exists for multi-workspace apps; this adapter uses the workspace token.) Scopes are set when the token is created.
- In Attio: Workspace settings → Developers → create an integration and copy its access token, with scopes `record_permission:read-write`, `note:read-write`, `object_configuration:read`. Store the token as the connection credential (`accessToken`), encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Endpoints used (base `https://api.attio.com/v2`, verified against developers.attio.com / docs.attio.com)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /objects` |
| Import | `POST /objects/people/records/query` (`{limit}`) |
| Find by email | `POST /objects/people/records/query` (`{filter: {email_addresses: {$contains: <email>}}, limit: 1}`) |
| Create / upsert | `POST /objects/people/records?matching_attribute=email_addresses` (assert) |
| Update | `PATCH /objects/people/records/{record_id}` |
| Note | `POST /notes` (`{data: {parent_object: "people", parent_record_id, title, content, format: "plaintext"}}`) |

Record values are arrays of typed values, e.g. `values: { name: [{full_name: "Ada Lovelace"}], email_addresses: [{email_address: "ada@example.com"}] }`.

## Field mapping

| NxtSend | Attio people record |
|---|---|
| email | `values.email_addresses[].email_address` |
| firstName + lastName | `values.name[].full_name` (+ `first_name` / `last_name`) |
| company | `values.company` — a record reference; not set automatically |
| status | — no standard field (see below) |

Attribute slugs follow Attio's standard people object. Workspaces can rename or customise attributes — confirm the slugs on the live workspace if import returns empty values.

## Sync direction

**Two-way for people records.** Import queries people records into NxtSend leads (deduped by email); export asserts (upserts) by the `email_addresses` matching attribute, or PATCHes the record found by email search. Notes attach to the person record.

## What is config-ready vs pending

- Implemented: import, export (assert/upsert + update), note sync, connect test, sync-job lifecycle, dedupe.
- NOT implemented: status sync — people records have no standard status field (list-stage mapping is a follow-up); tag sync — no native tag field. Both throw config-ready errors.
- Pending: live verification against a real workspace; confirming attribute slugs on that workspace.
