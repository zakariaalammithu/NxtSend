/**
 * EmailBison — static configuration for the email-outreach adapter.
 *
 * Base URL https://dedi.emailbison.com and Bearer-token auth verified against the public OpenAPI reference (dedi.emailbison.com/api/reference): GET /api/users with 'Authorization: Bearer <token>'.
 * EmailBison is privately hosted: each account signs in at its own instance URL, so the base URL is overridable (EMAILBISON_BASE_URL) — confirm the workspace host before wiring a client.
 * Token creation (Settings > Developer API > New API Token, scoped to its workspace) verified against the developer page; the token authenticates only to the workspace where it was created.
 * Lead add / attach: the low-code docs describe adding a lead, then attaching leads to a campaign with {campaign_id} and a lead_ids array — but the literal endpoint paths were not present in the fetched reference text, so both operations are config-ready stubs. Do not guess the paths.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const EMAILBISON_CONFIG = {
  providerId: "emailbison",
  name: "EmailBison",
  baseUrl: "https://dedi.emailbison.com",
  docsUrl: "https://docs.emailbison.com/",
  authKind: "bearer",
  authType: "bearer_token",
  envVar: "EMAILBISON_API_KEY",
} as const;

export const EMAILBISON_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "EMAILBISON_API_KEY", purpose: "EmailBison API token (Settings > Developer API > New API Token). Scoped to the workspace where it was created. Sent as a Bearer token." },
  { name: "EMAILBISON_BASE_URL", purpose: "Optional base-URL override for a per-instance host (default: https://dedi.emailbison.com)." },
];

export const EMAILBISON_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email (unverified provider field)", required: true },
  { source: "first_name", target: "first_name (unverified provider field)", required: false },
  { source: "last_name", target: "last_name (unverified provider field)", required: false },
  { source: "company", target: "company (unverified provider field)", required: false },
  { source: "linkedin_url", target: "custom_variables / Linkedin URL (unverified)", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const EMAILBISON_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/api/users", note: "Connection test — returns the authenticated user's account details. Verified against the public API reference at dedi.emailbison.com/api/reference." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const EMAILBISON_CONFIG_READY: string[] = [
  "List campaigns — no campaign-list endpoint path was verified.",
  "Add leads to a campaign — the docs describe a leads endpoint plus an attach-to-campaign endpoint taking {campaign_id} and a lead_ids array, but the literal paths were not in the fetched reference text, so nothing is called.",
  "Sync replies — no reply endpoint verified.",
  "Sync bounced / unsubscribed — no bounce endpoint verified."
];

export const EMAILBISON_DEFINITION: ProviderDefinition = {
  id: "emailbison",
  name: "EmailBison",
  category: "email_outreach",
  authType: "bearer_token",
  docsUrl: "https://docs.emailbison.com/",
  capabilities: [
    "Connection test only (GET /api/users) — verified",
    "Campaign list, lead add / attach, reply and bounce sync: NOT implemented — endpoint paths were not verified against docs.emailbison.com (config-ready)",
    "Suppression-checked export is enforced by the shared helpers and will apply once the lead endpoints are verified"
  ],
  twoWaySync: false,
};
