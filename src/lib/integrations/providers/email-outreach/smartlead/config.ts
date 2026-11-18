/**
 * Smartlead — static configuration for the email-outreach adapter.
 *
 * Base URL https://server.smartlead.ai/api/v1 and api_key query-parameter auth verified against https://api.smartlead.ai/ (getting-started guide) and the Smartlead help center: 'The key must be sent in the URL. A key sent in a request header is not accepted.' There is no OAuth or Bearer option.
 * POST /campaigns/{id}/leads body { lead_list: [{ email, first_name, last_name, company_name, custom_fields }] } and added_count / skipped_count response verified against the official getting-started guide (max 400 leads per request).
 * Lead statuses STARTED / INPROGRESS / COMPLETED / STOPPED / PAUSED / BLOCKED and email flags is_bounced / is_replied / is_unsubscribed verified against the Search Campaign Leads reference.
 * SECURITY NOTE: the API key travels in the request URL, so it can land in provider-side logs. Prefer the body form for POSTs where Smartlead accepts it; never log request URLs that contain the key.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const SMARTLEAD_CONFIG = {
  providerId: "smartlead",
  name: "Smartlead",
  baseUrl: "https://server.smartlead.ai/api/v1",
  docsUrl: "https://api.smartlead.ai/",
  authKind: "api-key-query",
  authType: "api_key",
  envVar: "SMARTLEAD_API_KEY",
} as const;

export const SMARTLEAD_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "SMARTLEAD_API_KEY", purpose: "Smartlead API key (Settings > API Keys). Sent as the api_key query parameter on every request — Smartlead's only auth method; it is never sent as a header." },
];

export const SMARTLEAD_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "first_name", required: false },
  { source: "last_name", target: "last_name", required: false },
  { source: "company_name", target: "company_name", required: false },
  { source: "linkedin_url", target: "custom_fields.linkedin_url", required: false },
  { source: "job_title", target: "custom_fields.job_title", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const SMARTLEAD_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/campaigns/", note: "List campaigns (also the connection test)." },
  { method: "POST", path: "/campaigns/create", note: "Create a campaign (draft). Not called by the adapter — listed for the operator." },
  { method: "POST", path: "/campaigns/{id}/leads", note: "Add up to 400 leads per call; body { lead_list: [{ email, first_name, last_name, company_name, custom_fields }] }. Response reports added_count / skipped_count." },
  { method: "GET", path: "/campaigns/{id}/leads", note: "List leads in a campaign, with per-lead status (STARTED / INPROGRESS / COMPLETED / STOPPED / PAUSED / BLOCKED) and email flags (is_bounced, is_replied, is_unsubscribed)." },
  { method: "GET", path: "/leads/?email=", note: "Look up a lead by email. Not called by the adapter — listed for the operator." },
  { method: "PATCH", path: "/campaigns/{id}/leads/{lead_id}/status", note: "Update one lead's status. Not called by the adapter — the status value vocabulary for unsubscribing was not verified." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const SMARTLEAD_CONFIG_READY: string[] = [
  "Sync replies — the master-inbox message endpoint path was not verified against api.smartlead.ai.",
  "Push an unsubscribe into Smartlead — PATCH /campaigns/{id}/leads/{lead_id}/status is verified as an endpoint, but the status value that means 'unsubscribed' was not verified, so the adapter does not call it.",
  "Start / pause a campaign — POST /campaigns/{id}/status exists, but the docs contradict themselves on the value (START vs ACTIVE); the adapter does not call it."
];

export const SMARTLEAD_DEFINITION: ProviderDefinition = {
  id: "smartlead",
  name: "Smartlead",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://api.smartlead.ai/",
  capabilities: [
    "List campaigns (GET /campaigns/) — verified",
    "Add up to 400 leads per call (POST /campaigns/{id}/leads, { lead_list: [...] }) — verified; the official getting-started guide uses this exact body",
    "Suppression-checked export — a suppressed lead is never sent",
    "Campaign-lead status read (GET /campaigns/{id}/leads): BLOCKED / is_bounced / is_unsubscribed feed the NxtSend suppression list — verified endpoint, defensive classification",
    "Reply sync: NOT implemented — the master-inbox message endpoint path was not verified (config-ready)",
    "Campaign start / pause is NOT called by the adapter: the docs contradict themselves on the status value (START vs ACTIVE), so it stays manual until confirmed"
  ],
  twoWaySync: true,
};
