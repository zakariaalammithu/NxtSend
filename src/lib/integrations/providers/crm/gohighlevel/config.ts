/**
 * GoHighLevel config — verified against the HighLevel API v2
 * reference (marketplace.gohighlevel.com docs, checked 2026-11-19).
 *
 * Auth: Private Integration Token OR OAuth 2.0 access token, both
 * sent as `Authorization: Bearer <token>`, PLUS a required
 * `Version: 2021-07-28` header on every request. API v1 is
 * deprecated (end of support 2025-12-31) — this adapter uses v2
 * only. No env var is read by this code: the token + locationId are
 * stored encrypted in `integration_connections`.
 *
 * Verified endpoints (base https://services.leadconnectorhq.com):
 *  - GET  /contacts/?locationId=&limit=
 *  - GET  /contacts/{contactId}
 *  - POST /contacts/search {locationId, query}
 *  - POST /contacts/ {locationId, firstName, lastName, email, companyName, tags}
 *  - PUT  /contacts/{contactId}
 *
 * CONFIG-READY ONLY (exact v2 path not verified in this pass — no
 * request is sent): contact notes and tag add/remove endpoints.
 * The adapter throws a config-ready error for those operations
 * until the paths are confirmed against the official reference.
 */

import type { FieldMapping } from "../../types";

export const GOHIGHLEVEL_BASE_URL = "https://services.leadconnectorhq.com";
export const GOHIGHLEVEL_API_VERSION_HEADER = "2021-07-28";
export const GOHIGHLEVEL_DOCS_URL = "https://marketplace.gohighlevel.com/docs/";

export const GOHIGHLEVEL_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: false },
  { source: "firstName", target: "firstName", required: false },
  { source: "lastName", target: "lastName", required: false },
  { source: "company", target: "companyName", required: false },
  { source: "tags", target: "tags[]", required: false },
];

export const GOHIGHLEVEL_CONFIG = {
  provider: "gohighlevel",
  name: "GoHighLevel",
  baseUrl: GOHIGHLEVEL_BASE_URL,
  authType: "bearer_token" as const,
  docsUrl: GOHIGHLEVEL_DOCS_URL,
  scopes: ["contacts.readonly", "contacts.write"],
  fieldMappings: GOHIGHLEVEL_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Credential extras the adapter requires. */
  requiredExtras: ["locationId"],
  capabilities: [
    "Import contacts (list + search within a location)",
    "Export leads (create / update contact by email within a location)",
    "Status sync via a NxtSend status tag on the contact",
    "Notes + tag endpoints are CONFIG-READY only (paths unverified)",
  ],
  setup: [
    "In the GoHighLevel sub-account: Settings → Integrations → Private Integrations → create one with contacts.readonly + contacts.write scopes",
    "Store the Private Integration Token as the connection credential (accessToken) and the sub-account locationId as extra.locationId",
  ],
} as const;
