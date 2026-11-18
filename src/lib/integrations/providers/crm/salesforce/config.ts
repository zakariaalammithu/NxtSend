/**
 * Salesforce config — verified against developer.salesforce.com
 * (REST API / sObjects / SOQL query, checked 2026-11-19).
 *
 * Auth: OAuth 2.0 web-server flow against a Connected App. The
 * token endpoint returns an `instance_url` — that per-org URL is
 * the API base and MUST be stored with the credential
 * (`extra.instanceUrl`); there is no single fixed base URL.
 *
 * Verified endpoints (base = instance URL, API v64.0):
 *  - GET  /services/data/v64.0/query?q=<SOQL>
 *  - GET  /services/data/v64.0/sobjects/Contact/{id}
 *  - POST /services/data/v64.0/sobjects/Contact
 *  - PATCH /services/data/v64.0/sobjects/Contact/{id}
 *  - POST /services/data/v64.0/sobjects/Task
 *  - GET  /services/data/v64.0/limits (connect test)
 *  - POST https://login.salesforce.com/services/oauth2/token (token exchange)
 *
 * No env var is read by this code: tokens + instance URL are stored
 * encrypted in `integration_connections` (migration 030).
 *
 * OAuth connect/callback routes are NOT implemented in this stage:
 * the shared OAuth handlers (`src/lib/oauth/handlers.ts`) and
 * `OAuthProvider` type are typed to Google/Microsoft only, and
 * extending them is outside this worker's partition.
 */

import type { FieldMapping } from "../../types";

export const SALESFORCE_API_VERSION = "v64.0";
export const SALESFORCE_LOGIN_URL = "https://login.salesforce.com";
export const SALESFORCE_DOCS_URL =
  "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_what_is_rest_api.htm";

/** SOQL fields read on every Contact fetch. */
export const SALESFORCE_CONTACT_FIELDS = [
  "Id",
  "FirstName",
  "LastName",
  "Email",
  "AccountId",
  "Title",
  "Description",
];

export const SALESFORCE_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "Email", required: true },
  { source: "firstName", target: "FirstName", required: true },
  { source: "lastName", target: "LastName", required: true },
  { source: "company", target: "Account.Name (via AccountId)", required: false },
  { source: "jobTitle", target: "Title", required: false },
  { source: "linkedinUrl", target: "Description (note — no standard LinkedIn field)", required: false },
];

export const SALESFORCE_CONFIG = {
  provider: "salesforce",
  name: "Salesforce",
  apiVersion: SALESFORCE_API_VERSION,
  loginUrl: SALESFORCE_LOGIN_URL,
  authType: "oauth2" as const,
  docsUrl: SALESFORCE_DOCS_URL,
  scopes: ["api", "refresh_token", "offline_access"],
  fieldMappings: SALESFORCE_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Credential extras the adapter requires. */
  requiredExtras: ["instanceUrl"],
  capabilities: [
    "Import contacts (SOQL query)",
    "Export leads (create / update Contact by email)",
    "Sync activity as a Task linked to the Contact",
    "Status sync NOT implemented: Contact has no status field",
  ],
  setup: [
    "Create a Connected App in Salesforce Setup → App Manager with OAuth enabled and callback URL set",
    "Complete the OAuth web-server flow; store access token, refresh token and the returned instance_url as the Salesforce connection credential (extra.instanceUrl)",
    "OAuth connect/callback routes are pending a shared-handler extension — see the module header",
  ],
} as const;
