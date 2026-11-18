/**
 * Lemlist — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.lemlist.com/api and HTTP Basic auth (empty username, API key as password — base64 of ':<key>') verified against the Lemlist API reference summary and client libraries.
 * GET /campaigns, GET /campaigns/{campaignId}/leads and POST /campaigns/{campaignId}/leads verified against the same sources; the add-lead example body uses { email, firstName, ... }.
 * The LinkedIn URL is kept in NxtSend's identity map and is NOT pushed as a Lemlist custom field — the field name was not verified.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const LEMLIST_CONFIG = {
  providerId: "lemlist",
  name: "Lemlist",
  baseUrl: "https://api.lemlist.com/api",
  docsUrl: "https://developer.lemlist.com/",
  authKind: "basic",
  authType: "api_key",
  envVar: "LEMLIST_API_KEY",
} as const;

export const LEMLIST_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "LEMLIST_API_KEY", purpose: "Lemlist API key (Settings > Integrations > API Key). HTTP Basic auth with an empty username and the key as the password (base64 of ':<key>')." },
];

export const LEMLIST_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "firstName", required: false },
  { source: "last_name", target: "lastName", required: false },
  { source: "company", target: "companyName", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const LEMLIST_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/campaigns", note: "List campaigns (also the connection test). Supports page/limit or cursor pagination." },
  { method: "GET", path: "/campaigns/{campaignId}/leads", note: "List leads in a campaign." },
  { method: "POST", path: "/campaigns/{campaignId}/leads", note: "Add one lead to a campaign ({ email, firstName, ... })." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const LEMLIST_CONFIG_READY: string[] = [
  "Sync replies — no Lemlist activities endpoint path was verified.",
  "Sync bounced / unsubscribed — the unsubscribes resource exists in client libraries but its endpoint path was not verified against developer.lemlist.com."
];

export const LEMLIST_DEFINITION: ProviderDefinition = {
  id: "lemlist",
  name: "Lemlist",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://developer.lemlist.com/",
  capabilities: [
    "List campaigns (GET /campaigns) — verified",
    "List / add leads in a campaign (GET /campaigns/{id}/leads, POST /campaigns/{id}/leads) — verified",
    "Suppression-checked export — a suppressed lead is never sent",
    "Campaign status is read from the campaign list (no separate single-campaign GET is used)",
    "Reply sync: NOT implemented — no activities endpoint verified (config-ready)",
    "Bounce / unsubscribe sync: NOT implemented — no unsubscribe-list endpoint path verified (config-ready)"
  ],
  twoWaySync: false,
};
