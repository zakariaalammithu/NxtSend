/**
 * Snov.io — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.snov.io, token endpoint POST /v1/oauth/access_token and 1-hour Bearer token verified against the official Snov.io API docs and knowledge base (API User ID + API Secret at app.snov.io/account/api).
 * GET /v1/get-user-campaigns verified via the Ibexa Connect reference (example: list campaigns).
 * The token endpoint takes form-encoded parameters (grant_type, client_id, client_secret), which ProviderHttpClient (JSON only) does not send — so that one call uses a bare fetch with the same 10s timeout, documented in the adapter. The client secret never appears in an error message.
 * The add-prospect-to-campaign endpoint path was not verified — the export is a config-ready stub. Linked Helper and similar tools send first/last name, email, company and position to a Snov.io campaign, but the literal REST path was not in the verified sources.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const SNOV_CONFIG = {
  providerId: "snov",
  name: "Snov.io",
  baseUrl: "https://api.snov.io",
  docsUrl: "https://snov.io/api",
  authKind: "bearer",
  authType: "oauth2",
  envVar: "SNOV_API_USER_ID",
} as const;

export const SNOV_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "SNOV_API_USER_ID", purpose: "Snov.io API User ID (Account > API). Exchanged with SNOV_API_SECRET for a 1-hour Bearer access token (POST /v1/oauth/access_token, client_credentials grant)." },
  { name: "SNOV_API_SECRET", purpose: "Snov.io API Secret — stored as extra.client_secret on the credential, never as its own env var in code." },
];

export const SNOV_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email (unverified provider field)", required: true },
  { source: "first_name", target: "first_name (unverified provider field)", required: false },
  { source: "last_name", target: "last_name (unverified provider field)", required: false },
  { source: "company", target: "company (unverified provider field)", required: false },
  { source: "linkedin_url", target: "linkedin_url (unverified provider field)", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const SNOV_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "POST", path: "/v1/oauth/access_token", note: "Client-credentials exchange (grant_type=client_credentials, client_id, client_secret; form-encoded). Returns access_token, 1-hour lifetime." },
  { method: "GET", path: "/v1/get-user-campaigns", note: "List the account's campaigns (also the connection test)." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const SNOV_CONFIG_READY: string[] = [
  "Add prospects to a campaign — the endpoint path was not verified against snov.io/api or the Snov.io knowledge base, so the export throws instead of calling a guessed URL.",
  "Sync replies — no Snov.io reply endpoint verified.",
  "Sync bounced / unsubscribed — no Snov.io campaign-stats / bounce endpoint path verified."
];

export const SNOV_DEFINITION: ProviderDefinition = {
  id: "snov",
  name: "Snov.io",
  category: "email_outreach",
  authType: "oauth2",
  docsUrl: "https://snov.io/api",
  capabilities: [
    "OAuth client-credentials token exchange (POST /v1/oauth/access_token, 1-hour token) — verified; token is cached in memory and refreshed on expiry",
    "List campaigns (GET /v1/get-user-campaigns) — verified (also the connection test)",
    "Suppression-checked export is enforced by the shared helpers and will apply once the add-to-campaign endpoint is verified",
    "Add prospects to a campaign: NOT implemented — the endpoint path was not verified (config-ready)",
    "Reply / bounce sync: NOT implemented — no endpoint verified (config-ready)",
    "Note: Snov.io is primarily a finder / verifier plus drip campaigns; the enrichment APIs (domain search, email finder, LinkedIn-profile enrichment) belong to the enrichment stage, not this one"
  ],
  twoWaySync: false,
};
