/**
 * Master Inbox — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.masterinbox.com verified from the published workflow example (POST https://api.masterinbox.com/api/api-webhook/v1/api/workflows/create-workflow) on masterinbox.com/api.
 * API key creation (Settings > APIs > Create new key; keys are per account, named, revocable) verified against masterinbox.com/api. The Authorization header scheme was NOT verified — the adapter stores the key but makes no live call with it until a read endpoint is confirmed against the public OpenAPI spec.
 * Master Inbox is a unified reply inbox, not a sequencer: it syncs replies from other providers' campaigns. There is no 'send leads to a campaign' operation for this provider by design.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const MASTERINBOX_CONFIG = {
  providerId: "masterinbox",
  name: "Master Inbox",
  baseUrl: "https://api.masterinbox.com",
  docsUrl: "https://masterinbox.com/api",
  authKind: "bearer",
  authType: "api_key",
  envVar: "MASTERINBOX_API_KEY",
} as const;

export const MASTERINBOX_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "MASTERINBOX_API_KEY", purpose: "Master Inbox API key (Settings > APIs > Create new key). Per-account, named, revocable. Header scheme not verified — see the adapter notes; no live call is made until a read endpoint is verified." },
  { name: "MASTERINBOX_BASE_URL", purpose: "Optional base-URL override for a per-instance host (default: https://api.masterinbox.com)." },
];

export const MASTERINBOX_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email (unverified provider field)", required: true },
  { source: "linkedin_url", target: "linkedin_url (unverified provider field)", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const MASTERINBOX_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  // No endpoint verified yet — see CONFIG_READY below.
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const MASTERINBOX_CONFIG_READY: string[] = [
  "Connection test — no read endpoint path was verified against the public OpenAPI reference at app.masterinbox.com/api-docs.html.",
  "Sync replies — the reply-list endpoint path was not verified (Master Inbox reports 215 endpoints in 30 groups; the exact paths were not in the fetched docs).",
  "Sync bounced / unsubscribed — no endpoint verified.",
  "Send leads to a campaign — Master Inbox is an inbox, not a sequencer; there is no send operation to implement."
];

export const MASTERINBOX_DEFINITION: ProviderDefinition = {
  id: "masterinbox",
  name: "Master Inbox",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://masterinbox.com/api",
  capabilities: [
    "Unified-inbox aggregator for replies from Instantly, Smartlead, EmailBison, Reply.io, Lemlist and others — NxtSend does NOT send campaigns through Master Inbox",
    "Connection test, reply sync, bounce sync: NOT implemented — no endpoint path was verified against the public OpenAPI reference (config-ready)",
    "Suppression-checked export is enforced by the shared helpers and will apply to any future write operation"
  ],
  twoWaySync: false,
};
