/**
 * Attio config — verified against developers.attio.com / docs.attio.com
 * (REST API v2 records + notes, checked 2026-11-19).
 *
 * Auth: workspace access token (API key), sent as
 * `Authorization: Bearer <token>`. OAuth 2.0 exists for
 * multi-workspace apps; this adapter uses the workspace token.
 * Scopes are set when the token is created. No env var is read by
 * this code: the token is stored encrypted in
 * `integration_connections` (migration 030).
 *
 * Verified endpoints (base https://api.attio.com/v2):
 *  - GET  /objects (connect test)
 *  - POST /objects/people/records/query {filter?, limit}
 *  - POST /objects/people/records {data:{values:{...}}}
 *  - POST /objects/people/records?matching_attribute=email_addresses (assert/upsert)
 *  - PATCH /objects/people/records/{record_id} {data:{values:{...}}}
 *  - POST /notes {data:{parent_object, parent_record_id, title, content, format}}
 *
 * Attribute slugs follow Attio's standard people object
 * (name, email_addresses). Workspaces can rename/customise
 * attributes — confirm the slugs on the live workspace if import
 * returns empty values.
 */

import type { FieldMapping } from "../../types";

export const ATTIO_BASE_URL = "https://api.attio.com/v2";
export const ATTIO_DOCS_URL = "https://developers.attio.com/docs";

export const ATTIO_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "values.email_addresses[].email_address", required: true },
  { source: "firstName + lastName", target: "values.name[].full_name", required: false },
  { source: "company", target: "values.company (record reference — set manually)", required: false },
];

export const ATTIO_CONFIG = {
  provider: "attio",
  name: "Attio",
  baseUrl: ATTIO_BASE_URL,
  authType: "bearer_token" as const,
  docsUrl: ATTIO_DOCS_URL,
  scopes: ["record_permission:read-write", "note:read-write", "object_configuration:read"],
  fieldMappings: ATTIO_FIELD_MAPPINGS,
  twoWaySync: true,
  capabilities: [
    "Import people records (query endpoint)",
    "Export leads (assert/upsert by email_addresses, then update)",
    "Sync notes (POST /v2/notes attached to the person record)",
    "Status sync NOT implemented: people records have no standard status field",
  ],
  setup: [
    "In Attio: Workspace settings → Developers → create an integration and copy its access token",
    "Give the token record_permission:read-write, note:read-write and object_configuration:read scopes",
    "Store the token as the Attio connection credential (accessToken)",
  ],
} as const;
