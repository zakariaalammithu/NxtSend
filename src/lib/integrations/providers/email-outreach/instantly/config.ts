/**
 * Instantly — static configuration for the email-outreach adapter.
 *
 * Base URL https://api.instantly.ai/api/v2 and Bearer v2-key auth verified against https://developer.instantly.ai/ (Introduction; API v1 deprecated 2026-01-19, v2 keys only).
 * GET /workspaces/current, GET /campaigns, POST /campaigns, POST /leads, POST /leads/add (up to 1,000 leads, campaign_id or list_id, idempotency_key) and GET /leads/list verified against the official API reference.
 * Lead objects in POST /leads/add must contain an email; first_name / last_name / company / custom_variables are the lead-model fields used by the adapter.
 *
 * Credentials are NEVER read from process.env by the adapter: they come
 * from the encrypted integration_connections store (Stage 1 engine).
 * The env-var names below are the conventional operator-facing names
 * for the credential that seeds a connection.
 */

import type { FieldMapping, ProviderDefinition } from "../../types";

export const INSTANTLY_CONFIG = {
  providerId: "instantly",
  name: "Instantly",
  baseUrl: "https://api.instantly.ai/api/v2",
  docsUrl: "https://developer.instantly.ai/",
  authKind: "bearer",
  authType: "bearer_token",
  envVar: "INSTANTLY_API_KEY",
} as const;

export const INSTANTLY_ENV_VARS: { name: string; purpose: string }[] = [
  { name: "INSTANTLY_API_KEY", purpose: "Instantly API v2 key (Settings > Integrations > API Keys, Version 2; Growth plan or above). Sent as a Bearer token." },
];

export const INSTANTLY_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "email", target: "email", required: true },
  { source: "first_name", target: "first_name", required: false },
  { source: "last_name", target: "last_name", required: false },
  { source: "company", target: "company", required: false },
  { source: "linkedin_url", target: "custom_variables.linkedin_url", required: false },
  { source: "job_title", target: "custom_variables.job_title", required: false }
];

/** Endpoints verified against the provider's official docs (see notes above). */
export const INSTANTLY_VERIFIED_ENDPOINTS: {
  method: string;
  path: string;
  note: string;
}[] = [
  { method: "GET", path: "/workspaces/current", note: "Connection test — returns the current workspace." },
  { method: "GET", path: "/campaigns", note: "List campaigns." },
  { method: "POST", path: "/campaigns", note: "Create a campaign (draft; sends nothing on its own). Not called by the adapter — listed for the operator." },
  { method: "POST", path: "/leads/add", note: "Add up to 1,000 leads to a campaign or list (campaign_id or list_id; each lead needs an email)." },
  { method: "POST", path: "/leads", note: "Create a single lead. Not called by the adapter — listed for the operator." },
  { method: "GET", path: "/leads/list", note: "List leads. Not called by the adapter — listed for the operator." }
];

/** Operations that are config-ready, not live: unverified endpoint, no guessed URL. */
export const INSTANTLY_CONFIG_READY: string[] = [
  "Sync replies — no Instantly reply-read endpoint was verified against developer.instantly.ai.",
  "Sync bounced / unsubscribed — no Instantly bounce or unsubscribe endpoint was verified."
];

export const INSTANTLY_DEFINITION: ProviderDefinition = {
  id: "instantly",
  name: "Instantly",
  category: "email_outreach",
  authType: "bearer_token",
  docsUrl: "https://developer.instantly.ai/",
  capabilities: [
    "List campaigns (GET /campaigns) — verified",
    "Add up to 1,000 leads to a campaign in one call (POST /leads/add) with an idempotency key, so a retried batch does not duplicate leads — verified",
    "Suppression-checked export — a suppressed lead is never sent",
    "Campaign status is read from the campaign list (no separate status endpoint is used)",
    "Reply sync: NOT implemented — no reply endpoint verified (config-ready)",
    "Bounce / unsubscribe sync: NOT implemented — no endpoint verified (config-ready)"
  ],
  twoWaySync: false,
};
