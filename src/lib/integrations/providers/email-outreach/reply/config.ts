/**
 * Reply.io — static configuration for the email-outreach adapter.
 *
 * Auth verified against the Reply help center: 'Send the key in the X-API-KEY header, or as Authorization: Bearer <key>.' Keys are scoped (All / Contacts / Sequences / Inbox / ...); API v3 checks the scope of each request.
 * POST /v1/people (upsert by email, linkedInUrl field) and POST /v1/people/{email} (update) verified via the Reply.io destination documentation. The v1 API allows 15,000 requests per user per month; v3 is rate-limited per minute / hour instead.
 * The campaignId field passed in the upsert body was NOT verified — Reply pushes a contact to a campaign 'when a campaign ID is configured', but the exact body field was not shown in the verified source. Confirm at docs.reply.io before relying on enrollment.
 * The connection test uses GET /v1/people, a collection GET inferred from the verified POST /v1/people resource — flagged UNVERIFIED in code; confirm before relying on it.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const REPLY_CONFIG = {
  providerId: "reply",
  name: "Reply.io",
  baseUrl: "https://api.reply.io",
  docsUrl: "https://docs.reply.io",
  authKind: "x-api-key",
  authType: "api_key",
  envVar: "REPLY_API_KEY",
} as const;

export const REPLY_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "REPLY_API_KEY", purpose: "Reply.io API key (Settings > API Key). Scoped per key; send it in the X-Api-Key header (Authorization: Bearer <key> also accepted)." },
];

export const REPLY_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "firstName", required: false },
  { source: "last_name", target: "lastName", required: false },
  { source: "company", target: "company", required: false },
  { source: "job_title", target: "title", required: false },
  { source: "linkedin_url", target: "linkedInUrl", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const REPLY_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "POST", path: "/v1/people", note: "Upsert a contact by email (creates or updates; supports linkedInUrl). Verified via the Reply.io destination docs." },
  { method: "POST", path: "/v1/people/{email}", note: "Update an existing contact by email. Verified via the same source." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const REPLY_CONFIG_READY: string[] = [
  "Connection test — GET /v1/people is a collection GET inferred from the verified POST /v1/people resource; it is flagged UNVERIFIED in the adapter and must be confirmed against docs.reply.io before it is relied on.",
  "List sequences / sync campaign status — no v3 sequence endpoint path was verified.",
  "Sync replies — no v3 inbox endpoint path was verified.",
  "Sync bounced / unsubscribed — no v3 endpoint path was verified."
];

export const REPLY_DEFINITION: ProviderDefinition = {
  id: "reply",
  name: "Reply.io",
  category: "email_outreach",
  authType: "api_key",
  docsUrl: "https://docs.reply.io",
  capabilities: [
    "Upsert contacts (POST /v1/people — email is the unique identifier; linkedInUrl is a supported field) — verified",
    "Suppression-checked export — a suppressed lead is never sent",
    "Sequence / campaign status, reply and bounce sync: NOT implemented — v3 endpoint paths were not verified (config-ready)",
    "Campaign push on upsert: the campaign id is passed in the upsert body, but that field name was NOT verified — confirm at docs.reply.io before relying on enrollment"
  ],
  twoWaySync: false,
};
