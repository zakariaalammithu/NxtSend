# Monday.com — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Monday.com account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: personal API v2 token, sent as the `Authorization` header with **no `Bearer` prefix** (the token itself is the header value). Every request is a POST to the single GraphQL endpoint with an `API-Version: 2024-10` header.
- In Monday: avatar → Developers → API token → generate a personal API v2 token. Store the token as the connection credential (`apiKey`), the board id as `extra.boardId`, and the column ids as `extra.columns` (JSON object `{email, company, jobTitle, status}`). All are stored encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.

## Operations used (endpoint `https://api.monday.com/v2`, verified against developer.monday.com)

| Operation | GraphQL |
|---|---|
| Connect test | `query { me { id name } }` |
| Import | `query { boards(ids: [$boardId]) { items_page(limit:) { items { id name column_values { id text value } } } } }` |
| Create | `mutation { create_item(board_id:, item_name:, column_values:) { id } }` |
| Update | `mutation { change_multiple_column_values(board_id:, item_id:, column_values:) { id } }` |
| Status | `mutation { change_column_value(board_id:, item_id:, column_id:, value:) { id } }` |

Column values are JSON strings keyed by column id; text columns take a plain string, email columns take `{email, text}`, status columns take `{label}`.

## Field mapping

A Monday board is a generic table, not a CRM — the operator configures which board holds leads and which columns hold the fields.

| NxtSend | Monday board |
|---|---|
| firstName + lastName | `item_name` |
| email | column `extra.columns.email` |
| company | column `extra.columns.company` |
| jobTitle | column `extra.columns.jobTitle` |
| status | column `extra.columns.status` (status column) |

## Sync direction

**Two-way for board items.** Import reads the board's items into NxtSend leads (deduped by email); export creates an item or updates the matched item's column values by email-column lookup. Status sync writes the status column via `change_column_value`. Without an email column, export cannot dedupe by email and always creates.

## What is config-ready vs pending

- Implemented: import, export, status sync (when a status column is configured), connect test, sync-job lifecycle, dedupe.
- CONFIG-READY ONLY (no request is sent): note sync — the `create_update` mutation was not verified against the official GraphQL reference in this pass, so the adapter throws a config-ready error instead of guessing it. Tag sync is not implemented (boards have no native tag field).
- Pending: live verification against a real board; confirming the column mapping on that board.
