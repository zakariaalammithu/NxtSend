/**
 * Woodpecker — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.woodpecker.co/rest and x-api-key header auth verified against the official authentication guide (GET https://api.woodpecker.co/rest/v1/me).
 * POST /v1/add_prospects_campaign ({ campaign: { campaign_id }, prospects: [...] }, up to 20,000 per request) and the prospect status vocabulary ACTIVE / BLACKLIST / BOUNCED / INVALID / REPLIED verified against the official 'Add prospects to a campaign' docs page.
 * The v1 endpoints are labelled legacy in the docs ('consider handling errors accordingly') but remain functional; v2 covers campaign creation only.
 * The LinkedIn URL is kept in NxtSend's identity map and is NOT pushed as a Woodpecker snippet — the snippet field name was not verified.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const WOODPECKER_CONFIG = {
  providerId: "woodpecker",
  name: "Woodpecker",
  baseUrl: "https://api.woodpecker.co/rest",
  docsUrl: "https://developers.woodpecker.co/",
  authKind: "x-api-key",
  authType: "api_key",
  envVar: "WOODPECKER_API_KEY",
} as const;

export const WOODPECKER_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "WOODPECKER_API_KEY", purpose: "Woodpecker API key (Marketplace > Integrations > API keys > Create a key). User-specific. Sent in the x-api-key header." },
];

export const WOODPECKER_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "first_name", required: false },
  { source: "last_name", target: "last_name", required: false },
  { source: "company", target: "company", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const WOODPECKER_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/v1/me", note: "Connection test — returns the authenticated user." },
  { method: "GET", path: "/v1/prospects", note: "Search / list prospects (search={field}={value}, campaigns_details=true)." },
  { method: "POST", path: "/v1/add_prospects_list", note: "Add prospects to the global prospect list (up to 20,000 per request). Not called by the adapter — the campaign variant is used instead." },
  { method: "POST", path: "/v1/add_prospects_campaign", note: "Add prospects to a campaign prospect list ({ campaign: { campaign_id }, prospects: [{ email, first_name, last_name, company, ... }] }, up to 20,000 per request). Prospects whose global status is not ACTIVE are rejected unless force is used — the adapter does not force." },
  { method: "POST", path: "/v2/campaigns", note: "Create a campaign (v2). Not called by the adapter — listed for the operator." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const WOODPECKER_CONFIG_READY: string[] = [
  "Sync replies — no Woodpecker reply endpoint was verified against developers.woodpecker.co."
];

export const WOODPECKER_DEFINITION: ProviderDefinition = {
  id: "woodpecker",
  name: "Woodpecker",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://developers.woodpecker.co/",
  capabilities: [
    "Connection test (GET /v1/me) — verified",
    "List / search prospects (GET /v1/prospects, campaigns_details=true) — verified",
    "Add prospects to a campaign (POST /v1/add_prospects_campaign, { campaign: { campaign_id }, prospects: [...] }, up to 20,000 per request) — verified against the official docs",
    "Suppression-checked export — a suppressed lead is never sent",
    "Prospect statuses ACTIVE / BLACKLIST / BOUNCED / INVALID / REPLIED are the verified vocabulary; BOUNCED and BLACKLIST feed the NxtSend suppression list",
    "Reply sync: NOT implemented — no reply endpoint verified (config-ready)"
  ],
  twoWaySync: true,
};
