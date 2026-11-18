/**
 * SmartReach — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.smartreach.io/api/v1 and X-API-KEY header auth verified against the SmartReach API docs (via dltHub's API reference summary) and the Make help page (Team Settings > Integrations > SmartReach API Key).
 * GET /campaigns, GET /campaigns/{id}, GET /prospects, POST /prospects and GET /prospects/{id} verified against the same reference.
 * Assign-prospect-to-campaign-by-email and add-email/domain-to-DNC are documented only as integration actions (Make / Ibexa); their REST paths were not verified, so they are config-ready.
 * The prospect-create request body field names were not verified against the official reference — confirm them at the SmartReach API docs before the first live send.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const SMARTREACH_CONFIG = {
  providerId: "smartreach",
  name: "SmartReach",
  baseUrl: "https://api.smartreach.io/api/v1",
  docsUrl: "https://help.smartreach.io/",
  authKind: "x-api-key",
  authType: "api_key",
  envVar: "SMARTREACH_API_KEY",
} as const;

export const SMARTREACH_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "SMARTREACH_API_KEY", purpose: "SmartReach REST API key (Settings > Integrations > SmartReach API > Get API Key > Generate New API Key). Sent in the X-API-KEY header." },
];

export const SMARTREACH_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email (unverified provider field)", required: true },
  { source: "first_name", target: "first_name (unverified provider field)", required: false },
  { source: "last_name", target: "last_name (unverified provider field)", required: false },
  { source: "company", target: "company (unverified provider field)", required: false },
  { source: "job_title", target: "title (unverified provider field)", required: false },
  { source: "linkedin_url", target: "linkedin_url (unverified provider field)", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const SMARTREACH_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/campaigns", note: "List campaigns (also the connection test)." },
  { method: "GET", path: "/campaigns/{id}", note: "Get one campaign." },
  { method: "GET", path: "/prospects", note: "List prospects (paged, up to 500 per page)." },
  { method: "POST", path: "/prospects", note: "Add a new prospect." },
  { method: "GET", path: "/prospects/{id}", note: "Get one prospect." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const SMARTREACH_CONFIG_READY: string[] = [
  "Assign prospect to campaign by email — the action is documented (Make / Ibexa modules), but the endpoint path was not verified, so the export stops after creating prospects and reports this step as config-ready.",
  "Add email / domain to DNC — action names documented, endpoint paths not verified.",
  "Sync replies — no SmartReach reply endpoint verified.",
  "Sync bounced / unsubscribed — no status endpoint verified."
];

export const SMARTREACH_DEFINITION: ProviderDefinition = {
  id: "smartreach",
  name: "SmartReach",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://help.smartreach.io/",
  capabilities: [
    "List campaigns and get one campaign (GET /campaigns, GET /campaigns/{id}) — verified",
    "List / get prospects (GET /prospects, GET /prospects/{id}) — verified",
    "Create prospects (POST /prospects) — verified; used by the export flow",
    "Assign prospect to campaign: NOT implemented — the endpoint path was not verified, so sendLeadsToEmailCampaign creates prospects and then reports the assignment step as config-ready (nothing is silently enrolled)",
    "Add email / domain to DNC: NOT implemented — action names are documented, paths are not (config-ready)",
    "Reply sync: NOT implemented — no reply endpoint verified (config-ready)"
  ],
  twoWaySync: false,
};
