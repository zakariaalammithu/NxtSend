/**
 * Monday.com config — verified against developer.monday.com
 * (GraphQL API reference, checked 2026-11-19).
 *
 * Auth: personal API v2 token, sent as the `Authorization` header
 * with NO Bearer prefix (the token itself is the header value).
 * Every request is a POST to the single GraphQL endpoint, with an
 * `API-Version` header (2024-10 used here). No env var is read by
 * this code: the token + board/column mapping are stored encrypted
 * in `integration_connections` (migration 030).
 *
 * Verified GraphQL operations (endpoint https://api.monday.com/v2):
 *  - query { me { id name } } (connect test)
 *  - query { boards(ids:[...]) { columns { id title type } } } (column discovery)
 *  - query { boards(ids:[...]) { items_page(limit:...) { items { id name column_values { id text value } } } } }
 *  - mutation { create_item(board_id:, item_name:, column_values:) { id } }
 *  - mutation { change_multiple_column_values(board_id:, item_id:, column_values:) { id } }
 *  - mutation { change_column_value(board_id:, item_id:, column_id:, value:) { id } }
 *
 * A Monday board is a generic table, not a CRM: the operator must
 * configure which board holds leads and which columns hold email /
 * name / company / status. Column values are JSON strings keyed by
 * column id. `column_values` on create/update is a JSON-encoded
 * string.
 *
 * CONFIG-READY ONLY (mutation not verified in this pass — no
 * request is sent): posting an update/note on an item
 * (`create_update`).
 */

import type { FieldMapping } from "../../types";

export const MONDAY_BASE_URL = "https://api.monday.com/v2";
export const MONDAY_API_VERSION = "2024-10";
export const MONDAY_DOCS_URL = "https://developer.monday.com/api-reference/";

export const MONDAY_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "firstName + lastName", target: "item_name", required: true },
  { source: "email", target: "column: email (operator-configured column id)", required: false },
  { source: "company", target: "column: company (operator-configured column id)", required: false },
  { source: "jobTitle", target: "column: job title (operator-configured column id)", required: false },
  { source: "status", target: "column: status (operator-configured column id)", required: false },
];

export interface MondayColumnMapping {
  email?: string;
  company?: string;
  jobTitle?: string;
  status?: string;
}

export const MONDAY_CONFIG = {
  provider: "monday",
  name: "Monday.com",
  baseUrl: MONDAY_BASE_URL,
  apiVersion: MONDAY_API_VERSION,
  authType: "api_key" as const,
  docsUrl: MONDAY_DOCS_URL,
  fieldMappings: MONDAY_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Credential extras the adapter requires. */
  requiredExtras: ["boardId"],
  /** Optional credential extra: JSON object {email, company, jobTitle, status} of column ids. */
  optionalExtras: ["columns"],
  capabilities: [
    "Import board items as leads (items_page)",
    "Export leads (create_item / change_multiple_column_values by email column)",
    "Status sync via a status column (change_column_value)",
    "Notes CONFIG-READY only: create_update mutation unverified",
  ],
  setup: [
    "In Monday: avatar → Developers → API token → generate a personal API v2 token",
    "Create (or pick) a board for NxtSend leads and note its board id + the column ids for email, company, job title and status",
    "Store the token as the connection credential (apiKey), boardId as extra.boardId and the column ids as extra.columns",
  ],
} as const;
