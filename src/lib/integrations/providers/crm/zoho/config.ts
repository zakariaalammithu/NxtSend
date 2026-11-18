/**
 * Zoho CRM config — verified against zoho.com/crm/developer/docs
 * (API v2 Records + Notes, checked 2026-11-19).
 *
 * Auth: OAuth 2.0 access token, sent as
 * `Authorization: Zoho-oauthtoken <token>` (the header Zoho's own
 * docs use). Refresh via POST https://accounts.zoho.com/oauth/v2/token.
 * No env var is read by this code: tokens are stored encrypted in
 * `integration_connections` (migration 030).
 *
 * Verified endpoints (base https://www.zohoapis.com, US data
 * centre — EU/IN/AU accounts use zohoapis.eu / zohoapis.in /
 * zohoapis.com.au; set extra.baseUrl when the account is not US):
 *  - GET  /crm/v2/Leads?per_page=
 *  - GET  /crm/v2/Leads/search?criteria=(Email:equals:<email>)
 *  - POST /crm/v2/Leads {data:[{...}]}
 *  - PUT  /crm/v2/Leads/{id} {data:[{...}]}
 *  - POST /crm/v2/Notes {data:[{Note_Title, Note_Content, Parent_Id, se_module}]}
 *
 * NxtSend leads map to the Zoho Leads module (Lead_Status picklist
 * carries status). The Contacts module is a follow-up.
 */

import type { FieldMapping } from "../../types";

export const ZOHO_DEFAULT_BASE_URL = "https://www.zohoapis.com";
export const ZOHO_DOCS_URL = "https://www.zoho.com/crm/developer/docs/api/v2/insert-records.html";
export const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";

/** NxtSend status → Zoho Lead_Status picklist value. */
export const ZOHO_STATUS_MAP: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Contacted",
  converted: "Qualified",
  unresponsive: "Not Contacted",
};

export const ZOHO_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "Email", required: true },
  { source: "firstName", target: "First_Name", required: true },
  { source: "lastName", target: "Last_Name", required: true },
  { source: "company", target: "Company", required: true },
  { source: "jobTitle", target: "Designation", required: false },
  { source: "status", target: "Lead_Status", required: false },
];

export const ZOHO_CONFIG = {
  provider: "zoho",
  name: "Zoho CRM",
  baseUrl: ZOHO_DEFAULT_BASE_URL,
  authType: "oauth2" as const,
  docsUrl: ZOHO_DOCS_URL,
  scopes: ["ZohoCRM.modules.leads.ALL", "ZohoCRM.modules.notes.ALL"],
  fieldMappings: ZOHO_FIELD_MAPPINGS,
  twoWaySync: true,
  /** Optional credential extra: baseUrl for non-US data centres. */
  optionalExtras: ["baseUrl"],
  capabilities: [
    "Import leads (list + search by email criteria)",
    "Export leads (create / update Lead by email)",
    "Sync status via the Lead_Status picklist",
    "Sync notes (Notes module with Parent_Id + se_module)",
  ],
  setup: [
    "Register a client in the Zoho Developer Console (API Console) with the scopes above and complete the OAuth flow",
    "Store the access token (and refresh token) as the Zoho connection credential; set extra.baseUrl for EU/IN/AU accounts",
  ],
} as const;
