/**
 * Mailshake — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.mailshake.com/2017-04-01 (versioned) and API-key auth verified against the official API reference: key as query-string apiKey, in the JSON body, or via HTTP Basic auth (curl -u 'my-api-key:'). The adapter uses Basic auth.
 * GET /me, POST /campaigns/list, POST /recipients/list, POST /recipients/add ({ campaignID, addAsNewList, listOfEmails }) and POST /recipients/unsubscribe verified against the same reference.
 * Recipient add sends email addresses only (listOfEmails). Names / company are NOT sent by the verified call — Mailshake matches recipients by email.
 * The recipient status vocabulary was NOT verified: the bounce read only counts exact 'bounced' / 'unsubscribed' status strings and ignores everything else.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const MAILSHAKE_CONFIG = {
  providerId: "mailshake",
  name: "Mailshake",
  baseUrl: "https://api.mailshake.com/2017-04-01",
  docsUrl: "https://api-docs.mailshake.com/",
  authKind: "basic",
  authType: "api_key",
  envVar: "MAILSHAKE_API_KEY",
} as const;

export const MAILSHAKE_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "MAILSHAKE_API_KEY", purpose: "Mailshake API key (Extensions > API > Create API Key). HTTP Basic auth with the key as the username (curl -u 'key:'). A query-string apiKey is also accepted by Mailshake; the adapter uses Basic auth." },
];

export const MAILSHAKE_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "listOfEmails (comma-separated)", required: true }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const MAILSHAKE_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/me", note: "Connection test — returns the authenticated user." },
  { method: "POST", path: "/campaigns/list", note: "List campaigns (optional search filter)." },
  { method: "POST", path: "/recipients/list", note: "List recipients in a campaign (paginated)." },
  { method: "POST", path: "/recipients/add", note: "Add recipients to a campaign ({ campaignID, addAsNewList, listOfEmails })." },
  { method: "POST", path: "/recipients/unsubscribe", note: "Unsubscribe recipients ({ emailAddresses: comma-separated })." },
  { method: "POST", path: "/leads/create", note: "Create leads from email addresses in a campaign. Not called by the adapter — listed for the operator." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const MAILSHAKE_CONFIG_READY: string[] = [
  "Sync replies — no Mailshake reply endpoint was verified against api-docs.mailshake.com."
];

export const MAILSHAKE_DEFINITION: ProviderDefinition = {
  id: "mailshake",
  name: "Mailshake",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://api-docs.mailshake.com/",
  capabilities: [
    "Connection test (GET /me) — verified",
    "List campaigns (POST /campaigns/list) — verified",
    "List recipients (POST /recipients/list) — verified; used for the defensive bounce / unsubscribe read",
    "Add recipients to a campaign (POST /recipients/add, listOfEmails) — verified",
    "Unsubscribe recipients (POST /recipients/unsubscribe) — verified (available for pushing suppressions out)",
    "Suppression-checked export — a suppressed lead is never sent",
    "Reply sync: NOT implemented — no reply endpoint verified (config-ready)"
  ],
  twoWaySync: true,
};
