/**
 * HotHawk config — verified against the official developer docs at
 * https://hothawk.ai/developers and the published OpenAPI spec at
 * https://api.hothawk.ai/docs/public (read 2026-11-19).
 *
 * HotHawk is cold-email sending infrastructure: inbox rotation,
 * warmup, multi-step campaigns, and a Master Inbox for replies.
 * It does NOT send LinkedIn messages from NxtSend — HotHawk's own
 * LinkedIn inbox endpoints (GET /linkedin/conversations,
 * POST /linkedin/send-message) are deliberately NOT wired by this
 * adapter, per the no-LinkedIn-send rule.
 *
 * Auth: API key (generated in workspace settings) as
 * `Authorization: Bearer <key>` on every request. Keys are usually
 * account-level (all workspaces); a client-user key is scoped to one
 * workspace. No env var is read by this code.
 *
 * Verified endpoints (base https://api.hothawk.ai/v1):
 *  - GET  /v1/workspaces — connection test (list workspaces)
 *  - GET  /v1/campaigns — list campaigns (page/take, data array)
 *  - POST /v1/campaigns — create campaign (not called by the adapter;
 *    request body not verified in this pass)
 *  - POST /v1/campaigns/{id}/activate | /pause
 *  - GET  /v1/campaigns/{id}/leads — campaign leads (page/take)
 *  - POST /v1/campaigns/{id}/leads — enrol leads (path verified;
 *    request body NOT verified in this pass, so enrolment is
 *    config-ready, not live — see HOTHAWK_CONFIG_READY)
 *  - GET  /v1/crm/leads — list leads (workspaceId, page/take;
 *    LeadDto: id, firstName, lastName, email, linkedinProfileUrl,
 *    jobTitle, phoneNumber, company, campaignStatus)
 *  - POST /v1/crm/leads — create one lead. Required: workspaceId,
 *    email, name. Optional: companyId, linkedinProfileUrl, jobTitle,
 *    phoneNumber, customVariables.
 *  - POST /v1/crm/leads/import — bulk JSON import. Required:
 *    workspaceId, records (max 5,000 rows; each record needs an
 *    email or linkedinProfileUrl). Optional mapping (known targets:
 *    email, firstName, lastName, name, jobTitle, phoneNumber,
 *    linkedinProfileUrl, companyDomain, companyName; unknown targets
 *    become custom variables), listId, tagIds.
 *  - PATCH /v1/crm/leads/{id} — update a lead (firstName, lastName,
 *    email, linkedinProfileUrl, phoneNumber, customVariables).
 *  - GET  /v1/crm/lists, POST /v1/crm/lists, GET /v1/crm/lists/{id}
 *  - GET  /v1/labels, GET /v1/events, POST /v1/webhooks
 *
 * Rate limit: 120 requests/minute (429 beyond it). List endpoints
 * take page (from 1) + take (1–150, default 25) and wrap results in
 * a `data` array.
 */

import type { FieldMapping } from "../../types";
import type { ProviderDefinition } from "../../types";

export const HOTHAWK_BASE_URL = "https://api.hothawk.ai/v1";
export const HOTHAWK_DOCS_URL = "https://hothawk.ai/developers";

export const HOTHAWK_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "firstName", required: false },
  { source: "last_name", target: "lastName", required: false },
  { source: "company", target: "companyName", required: false },
  { source: "job_title", target: "jobTitle", required: false },
  { source: "linkedin_url", target: "linkedinProfileUrl", required: false },
  { source: "phone", target: "phoneNumber", required: false },
];

export const HOTHAWK_CONFIG = {
  provider: "hothawk",
  name: "HotHawk",
  baseUrl: HOTHAWK_BASE_URL,
  authType: "bearer_token" as const,
  docsUrl: HOTHAWK_DOCS_URL,
  envVars: { apiKey: "HOTHAWK_API_KEY" },
  fieldMappings: HOTHAWK_FIELD_MAPPINGS,
  twoWaySync: false,
  /** Max rows per POST /v1/crm/leads/import call, per the OpenAPI spec. */
  maxImportRows: 5000,
  /** Max `take` on list endpoints, per the developer docs. */
  maxTake: 150,
  capabilities: [
    "List workspaces (GET /v1/workspaces) — connection test",
    "List campaigns (GET /v1/campaigns) and campaign leads (GET /v1/campaigns/{id}/leads)",
    "List CRM leads (GET /v1/crm/leads) and lead lists (GET /v1/crm/lists)",
    "Create one lead (POST /v1/crm/leads) and update a lead (PATCH /v1/crm/leads/{id})",
    "Bulk JSON lead import, up to 5,000 rows (POST /v1/crm/leads/import)",
    "No LinkedIn send — NOT SUPPORTED: HotHawk's /linkedin/* endpoints are deliberately not wired",
  ],
  endpointsVerified: true,
} as const;

/** Operations that are config-ready, not live: unverified request body, no guessed call. */
export const HOTHAWK_CONFIG_READY: string[] = [
  "Enrol leads into a campaign (POST /v1/campaigns/{id}/leads): path verified, request body NOT verified against the official OpenAPI spec in this pass — no call is made.",
  "Create a campaign (POST /v1/campaigns): request body NOT verified in this pass — no call is made; create campaigns in the HotHawk app, then list them here.",
  "Reply sync: no reply-read endpoint was verified in this pass.",
];

export const HOTHAWK_DEFINITION: ProviderDefinition = {
  id: "hothawk",
  name: "HotHawk",
  category: "email_outreach",
  authType: "bearer_token",
  docsUrl: HOTHAWK_DOCS_URL,
  capabilities: [
    "List campaigns + campaign leads (GET /v1/campaigns, GET /v1/campaigns/{id}/leads) — implemented, NOT live-verified",
    "List CRM leads and lists (GET /v1/crm/leads, GET /v1/crm/lists) — implemented, NOT live-verified",
    "Create / update one lead (POST /v1/crm/leads, PATCH /v1/crm/leads/{id}) — implemented, NOT live-verified",
    "Bulk lead import up to 5,000 rows (POST /v1/crm/leads/import) with suppression check — implemented, NOT live-verified",
    "Campaign enrolment (POST /v1/campaigns/{id}/leads): path verified, request body NOT verified — config-ready, no call made",
    "Rate limit 120 requests/min; list paging page/take (max take 150)",
    "Auth: API key as Authorization: Bearer <key>; stored encrypted in integration_connections",
    "No LinkedIn send — NOT SUPPORTED: HotHawk's /linkedin/* endpoints are deliberately not wired",
  ],
  twoWaySync: false,
};
