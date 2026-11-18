/**
 * Close config — verified against developer.close.com
 * (API Overview, checked 2026-11-19).
 *
 * Auth: API key via HTTP Basic Auth — the key is the username, the
 * password is empty. No env var is read by this code: the key is
 * stored encrypted in `integration_connections` (migration 030) and
 * supplied as the adapter credential (`apiKey`).
 *
 * Verified endpoints (base https://api.close.com/api/v1):
 *  - GET  /me/ (connect test)
 *  - GET  /lead/?_limit=&_skip=
 *  - POST /lead/ {name, contacts:[{name, emails:[{email}]}]}
 *  - PUT  /lead/{id}/
 *  - GET  /lead_status/
 *  - POST /activity/note/ {lead_id, note}
 *
 * Close's data model: leads are companies/organisations; contacts
 * are people inside a lead. A NxtSend lead maps to a Close lead
 * named after the company (or the person) with one nested contact.
 * Creating a contact without a lead_id auto-creates a lead.
 */

import type { FieldMapping } from "../../types";

export const CLOSE_BASE_URL = "https://api.close.com/api/v1";
export const CLOSE_DOCS_URL = "https://developer.close.com/api/overview";

export const CLOSE_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "company (or person name)", target: "lead.name", required: true },
  { source: "firstName + lastName", target: "lead.contacts[].name", required: true },
  { source: "email", target: "lead.contacts[].emails[].email", required: false },
  { source: "jobTitle", target: "lead.contacts[].title", required: false },
];

export const CLOSE_CONFIG = {
  provider: "close",
  name: "Close",
  baseUrl: CLOSE_BASE_URL,
  authType: "api_key" as const,
  docsUrl: CLOSE_DOCS_URL,
  fieldMappings: CLOSE_FIELD_MAPPINGS,
  twoWaySync: true,
  capabilities: [
    "Import leads with nested contacts",
    "Export leads (create / update lead by nested contact email)",
    "Sync status via lead status lookup",
    "Sync notes (note activity on the lead)",
  ],
  setup: [
    "In Close: Settings → API Keys → create a key (shown once)",
    "Store the API key as the Close connection credential (apiKey)",
  ],
} as const;
