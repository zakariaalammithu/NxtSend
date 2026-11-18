/**
 * Pipedrive config — verified against developers.pipedrive.com
 * (API v1 Persons / Activities / Notes, checked 2026-11-19).
 *
 * Auth: OAuth 2.0 access token, sent as `Authorization: Bearer
 * <token>`. (Pipedrive also documents a legacy per-user API token;
 * this adapter uses OAuth only.) No env var is read by this code:
 * the token is stored encrypted in `integration_connections`.
 *
 * Verified endpoints (base https://api.pipedrive.com/v1):
 *  - GET  /persons?limit=&start=
 *  - GET  /persons/search?term=
 *  - POST /persons
 *  - PUT  /persons/{id}
 *  - POST /notes {content, person_id}
 *  - POST /activities {subject, type, note, participants:[{person_id, primary:true}]}
 *  - GET  /users/me (connect test)
 *
 * Note: in API v1 the activity `person_id` field is read-only on
 * create — the person is set via the `participants` array with a
 * primary participant. Persons have no status field, so status sync
 * is not implemented.
 */

import type { FieldMapping } from "../../types";

export const PIPEDRIVE_BASE_URL = "https://api.pipedrive.com/v1";
export const PIPEDRIVE_DOCS_URL = "https://developers.pipedrive.com/docs/api/v1/Persons";

export const PIPEDRIVE_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email[].value (primary)", required: true },
  { source: "firstName + lastName", target: "name", required: true },
  { source: "company", target: "org_id (organisation must exist first)", required: false },
  { source: "jobTitle", target: "— no standard person field", required: false },
];

export const PIPEDRIVE_CONFIG = {
  provider: "pipedrive",
  name: "Pipedrive",
  baseUrl: PIPEDRIVE_BASE_URL,
  authType: "oauth2" as const,
  docsUrl: PIPEDRIVE_DOCS_URL,
  scopes: ["contacts:full", "activities:full", "deals:full"],
  fieldMappings: PIPEDRIVE_FIELD_MAPPINGS,
  twoWaySync: true,
  capabilities: [
    "Import persons (list + search by term)",
    "Export leads (create / update person by email)",
    "Sync notes (POST /v1/notes attached to the person)",
    "Sync activity (note-type activity with the person as primary participant)",
    "Status sync NOT implemented: persons have no status field",
  ],
  setup: [
    "Register an app in the Pipedrive Developer Hub and complete the OAuth flow",
    "Store the OAuth access token (and refresh token) as the Pipedrive connection credential",
    "Company is linked by org_id only — create the organisation in Pipedrive first if company linking is needed",
  ],
} as const;
