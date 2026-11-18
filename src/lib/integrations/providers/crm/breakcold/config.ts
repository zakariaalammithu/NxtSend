/**
 * Breakcold config — verified against docs.breakcold.com
 * (Public API overview + OpenAPI 3.1 contract at
 * /api/openapi.json, checked 2026-11-19).
 *
 * Auth: API key (Bearer) or OAuth, with scopes
 * (records:read/write, notes:read/write). No env var is read by
 * this code: the key + workspaceId are stored encrypted in
 * `integration_connections` (migration 030).
 *
 * Verified endpoints (base https://rest.breakcold.com/api/v1):
 *  - GET  /workspaces (free, connect test)
 *  - GET  /crm/objects?workspaceId= (list object types)
 *  - GET  /records?workspaceId=&objectTypeSlug=&search=&searchScope=
 *  - POST /records {workspaceId, objectTypeSlug, fields}
 *  - GET  /records/{recordId}
 *  - PATCH /records/{recordId} {fields}
 *  - POST /records/{recordId}/archive
 *  - GET  /records/{recordId}/notes
 *  - POST /records/{recordId}/notes {title, content}
 *
 * Records are typed by object: this adapter uses the standard
 * `person` object (objectTypeSlug "person", as in the OpenAPI
 * example). The workspaceId must be stored with the credential
 * (extra.workspaceId). Every successful read costs 0.2 Breakcold
 * tokens, every write 0.4 — high-volume syncs spend tokens.
 */

import type { FieldMapping } from "../../types";

export const BREAKCOLD_BASE_URL = "https://rest.breakcold.com/api/v1";
export const BREAKCOLD_DOCS_URL = "https://docs.breakcold.com/api/overview";
export const BREAKCOLD_PERSON_OBJECT_SLUG = "person";

export const BREAKCOLD_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "firstName + lastName", target: "fields.name", required: true },
  { source: "email", target: "fields.email", required: false },
  { source: "company", target: "fields.company (workspace field — confirm slug)", required: false },
  { source: "jobTitle", target: "fields.job_title (workspace field — confirm slug)", required: false },
];

export const BREAKCOLD_CONFIG = {
  provider: "breakcold",
  name: "Breakcold",
  baseUrl: BREAKCOLD_BASE_URL,
  authType: "api_key" as const,
  docsUrl: BREAKCOLD_DOCS_URL,
  scopes: ["records:read", "records:write", "notes:read", "notes:write"],
  fieldMappings: BREAKCOLD_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Credential extras the adapter requires. */
  requiredExtras: ["workspaceId"],
  capabilities: [
    "Import person records (list/search within a workspace)",
    "Export leads (create / update person record by email)",
    "Sync notes (POST /records/{id}/notes)",
    "Status sync CONFIG-READY only: no standard status field; the workspace stage field slug must be configured",
  ],
  setup: [
    "In Breakcold: Settings → API key → create a key with records + notes scopes",
    "Store the API key as the connection credential (apiKey) and the workspaceId as extra.workspaceId (GET /workspaces lists them)",
    "Confirm the company/job-title field slugs for your workspace's person object before relying on those mappings",
  ],
} as const;
