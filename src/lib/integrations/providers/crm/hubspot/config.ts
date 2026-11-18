/**
 * HubSpot config — verified against developers.hubspot.com
 * (CRM Contacts API + Notes API, checked 2026-11-19).
 *
 * Auth: OAuth 2.0 access token OR a private-app access token, both
 * sent as `Authorization: Bearer <token>`. No env var is read by
 * this code: the token is stored encrypted in `integration_connections`
 * (migration 030) and supplied as the adapter credential.
 *
 * Verified endpoints (base https://api.hubapi.com):
 *  - GET  /crm/v3/objects/contacts?properties=...&limit=&after=
 *  - POST /crm/v3/objects/contacts/search
 *  - POST /crm/v3/objects/contacts
 *  - POST /crm/v3/objects/contacts/batch/create
 *  - PATCH /crm/v3/objects/contacts/{id}
 *  - POST /crm/v3/objects/notes (inline associations, type 202 note_to_contact)
 *  - GET  /account-info/v3/details (connect test)
 *
 * OAuth connect/callback routes are NOT implemented in this stage:
 * the shared OAuth handlers (`src/lib/oauth/handlers.ts`) and
 * `OAuthProvider` type are typed to Google/Microsoft only, and
 * extending them is outside this worker's partition (the automation
 * worker owns the OAuth server files). Until that extension lands,
 * connect with a private-app access token.
 */

import type { FieldMapping } from "../../types";

export const HUBSPOT_BASE_URL = "https://api.hubapi.com";
export const HUBSPOT_DOCS_URL = "https://developers.hubspot.com/docs/api/crm/contacts";

/** NxtSend status → HubSpot lifecyclestage. */
export const HUBSPOT_STATUS_MAP: Record<string, string> = {
  new: "lead",
  contacted: "lead",
  replied: "salesqualifiedlead",
  converted: "customer",
  unresponsive: "lead",
};

export const HUBSPOT_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "firstName", target: "firstname", required: true },
  { source: "lastName", target: "lastname", required: false },
  { source: "company", target: "company", required: false },
  { source: "jobTitle", target: "jobtitle", required: false },
  { source: "linkedinUrl", target: "hs_linkedin_url", required: false },
  { source: "status", target: "lifecyclestage", required: false },
];

export const HUBSPOT_CONFIG = {
  provider: "hubspot",
  name: "HubSpot",
  baseUrl: HUBSPOT_BASE_URL,
  authType: "oauth2" as const,
  docsUrl: HUBSPOT_DOCS_URL,
  /** Scopes for an OAuth app or a private app. */
  scopes: [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.companies.write",
  ],
  fieldMappings: HUBSPOT_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Properties read on every contact fetch. */
  readProperties: [
    "email",
    "firstname",
    "lastname",
    "company",
    "jobtitle",
    "hs_linkedin_url",
    "lifecyclestage",
  ],
  capabilities: [
    "Import contacts (list + search by email)",
    "Export leads (create / update by email, batch create)",
    "Sync status via lifecyclestage",
    "Sync notes (note_to_contact association, type 202)",
  ],
  /** What an operator needs before connecting. No code reads these env names. */
  setup: [
    "Create a HubSpot private app (Settings → Integrations → Private Apps) with the scopes above, OR register an OAuth app",
    "Store the private-app access token (or OAuth access + refresh tokens) as the HubSpot connection credential",
    "OAuth connect/callback routes are pending a shared-handler extension — see the module header",
  ],
} as const;
