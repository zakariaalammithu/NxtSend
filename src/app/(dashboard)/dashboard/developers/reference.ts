/**
 * Developer Platform reference data — the single source of truth
 * for Dashboard → Developers.
 *
 * Every endpoint listed here is verified against the real route
 * files under src/app/api/integrations/<platform>/v1 (see
 * __tests__/reference.test.ts, which pins this table to the
 * filesystem: a listed endpoint must have a route file exporting
 * that method, and the n8n-family extras must NOT exist under
 * zapier). Nothing here is documented from memory or from a
 * roadmap — if a route does not exist, it is not listed.
 *
 * Scopes come from src/lib/muse-connector/oauth/scopes.ts
 * (SCOPE_DESCRIPTIONS / ALL_OAUTH_SCOPES); webhook events from
 * src/lib/integrations/rest/events.ts; rate limits from the auth
 * modules (REST_RATE_LIMIT_PER_MINUTE / MCP_RATE_LIMIT_PER_MINUTE).
 * This file adds no new names — it only arranges the real ones for
 * display.
 */

import { REST_RATE_LIMIT_PER_MINUTE } from "@/lib/integrations/rest/auth";
import { MCP_RATE_LIMIT_PER_MINUTE } from "@/lib/muse-connector/mcp";
import { DELIVERY_MAX_ATTEMPTS } from "@/lib/integrations/rest/outbox";

export type RestPlatformId =
  | "zapier"
  | "n8n"
  | "make"
  | "pabbly"
  | "albato"
  | "activepieces";

export const REST_PLATFORMS: {
  id: RestPlatformId;
  name: string;
  /** Base path of the platform's v1 API, relative to the origin. */
  basePath: string;
  /** OAuth scope prefix, e.g. "n8n" for `n8n.read`. */
  scopePrefix: string;
  /** Whether this platform accepts NxtSend API keys (nxt_live_). Only n8n does. */
  apiKeys: boolean;
  /** Whether this platform has the 7 extra n8n-family routes. */
  extendedRoutes: boolean;
  note: string;
}[] = [
  {
    id: "zapier",
    name: "Zapier",
    basePath: "/api/integrations/zapier/v1",
    scopePrefix: "zapier",
    apiKeys: false,
    extendedRoutes: false,
    note: "OAuth 2.0 only — Zapier has no API keys. 26 v1 routes: the common set, without the n8n-family extras.",
  },
  {
    id: "n8n",
    name: "n8n",
    basePath: "/api/integrations/n8n/v1",
    scopePrefix: "n8n",
    apiKeys: true,
    extendedRoutes: true,
    note: "OAuth 2.0 or a scoped API key (nxt_live_). 33 v1 routes: the common set plus the 7 n8n-family extras.",
  },
  {
    id: "make",
    name: "Make",
    basePath: "/api/integrations/make/v1",
    scopePrefix: "make",
    apiKeys: false,
    extendedRoutes: true,
    note: "OAuth 2.0 only. 33 v1 routes: the common set plus the 7 n8n-family extras. Not submitted to Make.",
  },
  {
    id: "pabbly",
    name: "Pabbly Connect",
    basePath: "/api/integrations/pabbly/v1",
    scopePrefix: "pabbly",
    apiKeys: false,
    extendedRoutes: true,
    note: "OAuth 2.0 only. 33 v1 routes: the common set plus the 7 n8n-family extras. Not submitted to Pabbly Connect.",
  },
  {
    id: "albato",
    name: "Albato",
    basePath: "/api/integrations/albato/v1",
    scopePrefix: "albato",
    apiKeys: false,
    extendedRoutes: true,
    note: "OAuth 2.0 only. 33 v1 routes: the common set plus the 7 n8n-family extras. Not submitted to Albato.",
  },
  {
    id: "activepieces",
    name: "Activepieces",
    basePath: "/api/integrations/activepieces/v1",
    scopePrefix: "activepieces",
    apiKeys: false,
    extendedRoutes: true,
    note: "OAuth 2.0 only. 33 v1 routes: the common set plus the 7 n8n-family extras. Not submitted to Activepieces.",
  },
];

export type ScopeTier = "read" | "write";

export interface RestEndpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path relative to the platform base, e.g. "/leads/{id}". */
  path: string;
  tier: ScopeTier;
  /** "all" = all six platforms; "n8n-family" = n8n, make, pabbly, albato, activepieces only. */
  platforms: "all" | "n8n-family";
  description: string;
  /** Response shape / behaviour worth knowing, in the route's own terms. */
  response: string;
}

/**
 * The v1 endpoint inventory, in route-file order per resource.
 * Tier rule (enforced by withRestRoute): GETs need the read tier,
 * mutations need the write tier. A token/key holding only read
 * gets 403 insufficient_scope on any mutation.
 */
export const REST_ENDPOINTS: RestEndpoint[] = [
  // ── Connection test ──
  {
    method: "GET",
    path: "/auth/test",
    tier: "read",
    platforms: "all",
    description: "Connection test — what the platform shows as the connection label.",
    response: "{ user: { id, email }, workspace: { id, name }, scopes }. Never returns token or key material.",
  },
  // ── Leads ──
  {
    method: "GET",
    path: "/leads",
    tier: "read",
    platforms: "all",
    description: "List leads, newest first.",
    response: "{ leads, count }. Query: limit (default 50, 1–100), after (exclusive ISO timestamp cursor), order (created_at_desc | updated_at_desc).",
  },
  {
    method: "POST",
    path: "/leads",
    tier: "write",
    platforms: "all",
    description: "Create a lead. A valid email is required.",
    response: "201 { lead, duplicate: false }. An existing email (case-insensitive) returns 200 { lead, duplicate: true } instead of a second row.",
  },
  {
    method: "GET",
    path: "/leads/{id}",
    tier: "read",
    platforms: "all",
    description: "Get one lead.",
    response: "{ lead }. 404 not_found when the id is not in this workspace.",
  },
  {
    method: "PATCH",
    path: "/leads/{id}",
    tier: "write",
    platforms: "all",
    description: "Update a lead.",
    response: "{ lead }. Updatable: first_name, last_name, email, company, job_title, linkedin_url, status, tags, custom_fields. Emits lead.updated with changed_fields.",
  },
  {
    method: "DELETE",
    path: "/leads/{id}",
    tier: "write",
    platforms: "n8n-family",
    description: "Permanently delete a lead. Not exposed on the Zapier surface.",
    response: "{ id, deleted: true }.",
  },
  {
    method: "POST",
    path: "/leads/import",
    tier: "write",
    platforms: "all",
    description: "Bulk import leads (at most 100 per call).",
    response: "201 { created, skipped, leads }. Invalid rows and duplicates are skipped, never created twice. A lead.created event carries the count and new lead ids.",
  },
  // ── Campaigns ──
  {
    method: "GET",
    path: "/campaigns",
    tier: "read",
    platforms: "all",
    description: "List campaigns, newest first (same limit/after pagination as leads).",
    response: "{ campaigns, count }.",
  },
  {
    method: "POST",
    path: "/campaigns",
    tier: "write",
    platforms: "all",
    description: "Create a campaign — draft only.",
    response: "201 { campaign }. Requires name, type (linkedin | email | mixed) and at least one sequence step. status other than draft is refused (invalid_status) — launch from the NxtSend dashboard.",
  },
  {
    method: "GET",
    path: "/campaigns/{id}",
    tier: "read",
    platforms: "all",
    description: "Get one campaign, with its steps.",
    response: "{ campaign: { ..., steps } }.",
  },
  {
    method: "PATCH",
    path: "/campaigns/{id}",
    tier: "write",
    platforms: "all",
    description: "Update name / type / description; status moves follow the action rules below.",
    response: "{ campaign }. status must be paused, active or archived (invalid_status otherwise).",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/{action}",
    tier: "write",
    platforms: "all",
    description: "Lifecycle action: pause, resume, stop or archive.",
    response: "{ campaign }. pause needs active, resume needs paused, stop/archive refuse an already-archived campaign (400 invalid_params). stop moves the campaign to archived — there is no stopped status. Unknown actions are refused (400 invalid_action).",
  },
  {
    method: "GET",
    path: "/campaigns/{id}/performance",
    tier: "read",
    platforms: "all",
    description: "Real campaign stats.",
    response: "{ campaign_id, stats }. accepted is always null — no data source exists for it, and it is never fabricated.",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/leads",
    tier: "write",
    platforms: "all",
    description: "Enroll leads into a campaign.",
    response: "{ campaignId, enrolled, skipped, notFound }. Body: { lead_ids }. Emits lead.added_to_campaign.",
  },
  {
    method: "DELETE",
    path: "/campaigns/{id}/leads/{leadId}",
    tier: "write",
    platforms: "all",
    description: "Remove a lead's enrollment. The lead record is kept.",
    response: "{ campaignId, leadId, removed: true }. Emits lead.removed_from_campaign.",
  },
  {
    method: "GET",
    path: "/campaigns/{id}/sequence",
    tier: "read",
    platforms: "n8n-family",
    description: "Get a campaign's sequence steps.",
    response: "{ campaign_id, steps }.",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/steps",
    tier: "write",
    platforms: "n8n-family",
    description: "Replace a campaign's sequence steps wholesale.",
    response: "{ campaign_id, steps }. step_type must be a valid step type; email / linkedin_message steps need non-empty content; delay_hours must be >= 0. LinkedIn steps are validated, not sent — no authorized LinkedIn provider exists.",
  },
  {
    method: "GET",
    path: "/campaigns/{id}/execution-status",
    tier: "read",
    platforms: "n8n-family",
    description: "Sequence execution counts by status and by step.",
    response: "{ campaign_id, status, executions: { total, by_status, steps: [{ step_order, total, by_status }] } }.",
  },
  {
    method: "GET",
    path: "/campaigns/{id}/follow-ups",
    tier: "read",
    platforms: "n8n-family",
    description: "List the workspace's upcoming scheduled follow-ups (the campaign segment verifies the campaign exists; follow-ups are workspace-scoped).",
    response: "{ campaign_id, follow_ups, count }.",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/follow-ups",
    tier: "write",
    platforms: "n8n-family",
    description: "Schedule a follow-up reply. Scheduling stores a row and sends nothing immediately — the worker sends due rows.",
    response: "201 { follow_up }. Requires conversation_id, body and scheduled_at (ISO 8601).",
  },
  {
    method: "DELETE",
    path: "/campaigns/{id}/follow-ups/{followUpId}",
    tier: "write",
    platforms: "n8n-family",
    description: "Cancel a scheduled follow-up. A cancelled follow-up is never sent.",
    response: "{ id, cancelled: true }.",
  },
  // ── Conversations / inbox ──
  {
    method: "GET",
    path: "/conversations",
    tier: "read",
    platforms: "all",
    description: "List inbox conversations (same limit pagination; ?q= searches).",
    response: "{ conversations, count }.",
  },
  {
    method: "GET",
    path: "/conversations/{id}",
    tier: "read",
    platforms: "all",
    description: "Get one conversation thread with its messages.",
    response: "{ conversation, messages }.",
  },
  {
    method: "POST",
    path: "/conversations/{id}/replies",
    tier: "write",
    platforms: "all",
    description: "Send an inbox reply — email channel only.",
    response: "201 { message, duplicate }. Requires content and idempotencyKey; a retried key replays the original reply instead of sending twice. LinkedIn replies are refused 422 (linkedin_unavailable) — no authorized LinkedIn provider exists.",
  },
  // ── Accounts / usage ──
  {
    method: "GET",
    path: "/accounts",
    tier: "read",
    platforms: "all",
    description: "List connected accounts (LinkedIn / email) for the workspace.",
    response: "{ accounts, count }.",
  },
  {
    method: "GET",
    path: "/accounts/{id}",
    tier: "read",
    platforms: "n8n-family",
    description: "Get one connected account.",
    response: "{ account }.",
  },
  {
    method: "GET",
    path: "/accounts/{id}/status",
    tier: "read",
    platforms: "n8n-family",
    description: "Recorded account + authorization status — a stored fact, never a live probe.",
    response: "{ account_status: { account_id, channel, provider, display_name, handle_or_email, status, auth_status, connected, warmup_status, warmup_enabled, last_sync_at, last_error } }. connected is true only when status is \"connected\".",
  },
  {
    method: "GET",
    path: "/usage",
    tier: "read",
    platforms: "all",
    description: "Workspace usage for the current period.",
    response: "{ usage }.",
  },
  // ── Search ──
  {
    method: "GET",
    path: "/search/leads",
    tier: "read",
    platforms: "all",
    description: "Find a lead by id (?id=) or email (?email=), or free-text search (?q=).",
    response: "{ leads }.",
  },
  {
    method: "GET",
    path: "/search/campaigns",
    tier: "read",
    platforms: "all",
    description: "Find campaigns by id (?id=), status (?status= draft | active | paused | archived) or name (?q=).",
    response: "{ campaigns }.",
  },
  {
    method: "GET",
    path: "/search/conversations",
    tier: "read",
    platforms: "all",
    description: "Search conversations (?q=, at most 100).",
    response: "{ conversations }.",
  },
  {
    method: "GET",
    path: "/search/accounts",
    tier: "read",
    platforms: "all",
    description: "Search accounts by provider, display name or handle/email (?q=).",
    response: "{ accounts }.",
  },
  // ── Dropdowns ──
  {
    method: "GET",
    path: "/dropdowns/campaigns",
    tier: "read",
    platforms: "all",
    description: "Campaign picker values.",
    response: "{ items: [{ id, name, status }] }.",
  },
  {
    method: "GET",
    path: "/dropdowns/accounts",
    tier: "read",
    platforms: "all",
    description: "Account picker values.",
    response: "{ items: [{ id, name, provider, channel, handle_or_email, status }] }.",
  },
  {
    method: "GET",
    path: "/dropdowns/lead-statuses",
    tier: "read",
    platforms: "all",
    description: "Lead-status picker values (fixed vocabulary).",
    response: "{ items: [{ id, name }] } — new, contacted, replied, converted, unresponsive.",
  },
  {
    method: "GET",
    path: "/dropdowns/sequences",
    tier: "read",
    platforms: "all",
    description: "Sequence-step picker values for one campaign.",
    response: "{ items: [{ id, name, step_type, step_order }] }. campaign_id is required (steps belong to a campaign).",
  },
  // ── Webhooks (REST Hooks) ──
  {
    method: "POST",
    path: "/webhooks/subscribe",
    tier: "write",
    platforms: "all",
    description: "Subscribe a target URL to one of the 8 webhook events.",
    response: "201 { id, event, target_url }. The per-subscription HMAC secret is generated server-side and never returned. A duplicate active subscription returns the existing id.",
  },
  {
    method: "GET",
    path: "/webhooks/subscriptions",
    tier: "read",
    platforms: "all",
    description: "List this workspace's subscriptions for the platform.",
    response: "{ subscriptions }. Secrets and payloads are never included.",
  },
  {
    method: "POST",
    path: "/webhooks/unsubscribe",
    tier: "write",
    platforms: "all",
    description: "Remove a subscription.",
    response: "{ id, unsubscribed: true }.",
  },
];

/** Health endpoints — public, no auth (rate limit off). One per platform; the enabled flag is named per platform. */
export const REST_HEALTH_ENDPOINTS: { platform: RestPlatformId; path: string; response: string }[] = [
  { platform: "zapier", path: "/api/integrations/zapier/health", response: '{ mode, zapierEnabled, version: "1.0.0" } — proves the route answers; it does not prove Zapier is connected.' },
  { platform: "n8n", path: "/api/integrations/n8n/health", response: '{ mode, n8nEnabled, version: "1.0.0" } — proves the route answers; it does not prove n8n is connected.' },
  { platform: "make", path: "/api/integrations/make/health", response: '{ mode, makeEnabled, version: "1.0.0" } — proves the route answers; it does not prove Make is connected.' },
  { platform: "pabbly", path: "/api/integrations/pabbly/health", response: '{ mode, pabblyEnabled, version: "1.0.0" } — proves the route answers; it does not prove Pabbly Connect is connected.' },
  { platform: "albato", path: "/api/integrations/albato/health", response: '{ mode, albatoEnabled, version: "1.0.0" } — proves the route answers; it does not prove Albato is connected.' },
  { platform: "activepieces", path: "/api/integrations/activepieces/health", response: '{ mode, activepiecesEnabled, version: "1.0.0" } — proves the route answers; it does not prove Activepieces is connected.' },
];

/** The shared OAuth 2.1 server every platform uses (src/app/api/muse/oauth/). */
export const OAUTH_ENDPOINTS: {
  method: "GET" | "POST";
  path: string;
  description: string;
  response: string;
}[] = [
  {
    method: "GET",
    path: "/api/muse/oauth/authorize",
    description: "Consent screen (GET) — the user approves or denies the requested scopes.",
    response: "HTML consent screen on GET; POST approves (issues a single-use authorization code, PKCE S256 for public clients) or denies.",
  },
  {
    method: "POST",
    path: "/api/muse/oauth/token",
    description: "Token endpoint. grant_type authorization_code (single-use code + PKCE verifier) or refresh_token (rotates on every use; reuse of an already-rotated refresh token revokes the whole grant, except the 10-minute reuse grace for Zapier/n8n grants).",
    response: "{ access_token, token_type: \"Bearer\", expires_in, refresh_token, scope, resource }. Demo Mode refuses (400 invalid_grant); unconfigured server answers 503 temporarily_unavailable.",
  },
  {
    method: "POST",
    path: "/api/muse/oauth/register",
    description: "Dynamic Client Registration (RFC 7591) — the one-time call that creates a platform client. Public clients by default; no pre-registered client secret exists.",
    response: "{ client_id, client_secret (shown once), ... }. Store the secret in the platform immediately.",
  },
  {
    method: "POST",
    path: "/api/muse/oauth/revoke",
    description: "Token revocation (RFC 7009).",
    response: "Revokes the token (and its grant's tokens).",
  },
];

/** The three hosted MCP servers. Tool counts are the registry's: 18 Muse tools, 54 ChatGPT/Claude tools. */
export const MCP_SERVERS: {
  path: string;
  platform: string;
  tools: number;
  scopes: string;
  note: string;
}[] = [
  {
    path: "/api/mcp",
    platform: "Muse (Meta)",
    tools: 18,
    scopes: "muse.read / muse.write / muse.send",
    note: "Streamable HTTP, JSON-RPC 2.0. Testable as a Custom Connector; not submitted to Meta, not approved.",
  },
  {
    path: "/api/mcp/chatgpt",
    platform: "ChatGPT (OpenAI)",
    tools: 54,
    scopes: "nxtsend.read / nxtsend.write / nxtsend.send",
    note: "Streamable HTTP, JSON-RPC 2.0, plus the campaigns Apps SDK widget. Testable in ChatGPT Developer Mode; not submitted to OpenAI.",
  },
  {
    path: "/api/mcp/claude",
    platform: "Claude (Anthropic)",
    tools: 54,
    scopes: "claude.read / claude.write / claude.send",
    note: "Streamable HTTP, JSON-RPC 2.0, plus 4 text-only MCP prompts and a read-only nxtsend://account resource. Testable as a custom connector; not submitted to Anthropic.",
  },
];

/** Error catalogue for the REST API ({error} + code, from rest/auth.ts + rest/api.ts). */
export const REST_ERRORS: { status: number; code: string; meaning: string }[] = [
  { status: 400, code: "invalid_params", meaning: "A required field is missing or malformed (e.g. no lead_ids, no steps, bad step_type)." },
  { status: 400, code: "invalid_email", meaning: "The email field is missing or not a valid email address." },
  { status: 400, code: "invalid_status", meaning: "status is not one of the accepted values (leads: new | contacted | replied | converted | unresponsive; campaigns: paused | active | archived; campaign create: draft only)." },
  { status: 400, code: "invalid_limit", meaning: "limit is not an integer between 1 and 100." },
  { status: 400, code: "invalid_cursor", meaning: "after is not an ISO 8601 timestamp." },
  { status: 400, code: "invalid_action", meaning: "The campaign action is not one of pause, resume, stop, archive." },
  { status: 400, code: "invalid_field / invalid_tags / invalid_custom_fields / no_fields", meaning: "A lead-update field has the wrong shape, or no updatable field was provided." },
  { status: 401, code: "unauthorized", meaning: "No Bearer token, or the token/key is invalid, expired, revoked, or bound to another platform's resource (RFC 8707)." },
  { status: 403, code: "insufficient_scope", meaning: "The token/key lacks the tier the route needs (read for GETs, write for mutations). Reconnect with the wider scope or create a key with that scope." },
  { status: 404, code: "not_found", meaning: "The id is not in this workspace (lead, campaign, conversation, account, follow-up, subscription)." },
  { status: 409, code: "already_delivered / not_failed", meaning: "Manual webhook retry (n8n only): the delivery was already delivered, or is still pending its first attempt." },
  { status: 422, code: "linkedin_unavailable", meaning: "A LinkedIn reply was attempted — refused by design. No authorized LinkedIn provider exists." },
  { status: 422, code: "suppressed", meaning: "The reply target is on the suppression list." },
  { status: 429, code: "rate_limited", meaning: `More than ${REST_RATE_LIMIT_PER_MINUTE} requests in a minute for this token. Back off and retry.` },
  { status: 500, code: "internal_error", meaning: "An unexpected server error. Internals are never leaked in the body." },
  { status: 502, code: "stats_unavailable / provider_error", meaning: "Campaign performance could not be computed, or the email provider failed the reply send." },
  { status: 503, code: "demo_mode", meaning: "Demo Mode: the platform surface refuses demo outright — demo data is never served to a REST platform." },
  { status: 503, code: "<platform>_disabled", meaning: "The platform is disabled on this deployment (<PLATFORM>_ENABLED=false). The OAuth routes stay available." },
  { status: 503, code: "not_configured", meaning: "The integration is not configured on this deployment (no admin client / no Supabase)." },
];

/** OAuth error catalogue (token endpoint, from the OAuth server). */
export const OAUTH_ERRORS: { code: string; meaning: string }[] = [
  { code: "invalid_grant", meaning: "The code is unknown, already used, expired, or the grant is for Demo Mode (no token is ever issued for the demo persona)." },
  { code: "invalid_client", meaning: "The client_id is unknown, or the client_secret does not match (confidential clients only)." },
  { code: "invalid_scope", meaning: "A requested scope is not one of the known scopes — refused, never silently dropped or widened." },
  { code: "invalid_request", meaning: "A required parameter is missing (e.g. no code_verifier for a PKCE-bound code)." },
  { code: "temporarily_unavailable", meaning: "The OAuth server is not configured (no admin client / TOKEN_ENCRYPTION_KEY missing or malformed)." },
];

/** Rate limits, imported from the modules that enforce them. */
export const RATE_LIMITS = {
  restPerMinutePerToken: REST_RATE_LIMIT_PER_MINUTE,
  mcpPerMinutePerGrant: MCP_RATE_LIMIT_PER_MINUTE,
  /** In-memory, per process: on serverless a token may get a fresh budget on another instance. A best-effort brake, not a distributed quota. */
  inMemoryNote:
    "Both limits are in-memory fixed windows (per process on serverless): a token that lands on another instance gets a fresh budget. Treat 120/min as a brake against runaway loops, not a guaranteed quota.",
} as const;

/** Webhook delivery rules (rest/outbox.ts). */
export const WEBHOOK_DELIVERY = {
  maxAttempts: DELIVERY_MAX_ATTEMPTS,
  immediateAttempt: "Best-effort immediate attempt at event time (8s timeout; any non-2xx counts as failed).",
  retrySchedule: "Failed deliveries retry after 5 minutes, then after 30 minutes — up to 3 attempts in total, then dead.",
  cronRetry:
    "Retries run on the daily 06:00 cron (CRON_SECRET), so a failed delivery may wait up to ~24h for its next retry. A dead delivery gets one more attempt only via the n8n manual retry endpoint (POST /api/integrations/n8n/webhooks/retry, Bearer OAuth write tier).",
  deactivate410:
    "A 410 response from the target deactivates the subscription (the workflow/webhook is gone). Subscriptions inactive for more than 30 days are cleaned up.",
  secretNote:
    "Every subscription gets its own HMAC secret, generated server-side at subscribe time and never returned — verify X-NxtSend-Signature / X-NxtSend-Timestamp in the receiver (see the public Developers page for the verification snippet).",
} as const;

/** cURL examples — real shapes from the route code (no invented fields). */
export const API_EXAMPLES = {
  listLeads: `curl https://<your-domain>/api/integrations/n8n/v1/leads?limit=5 \\
  -H "Authorization: Bearer <api-key-or-access-token>"`,
  listLeadsResponse: `{
  "leads": [
    {
      "id": "b3d51f49-1a2c-4e77-9a01-2f4c8d6e5b70",
      "email": "alex@example.com",
      "first_name": "Alex",
      "company": "Example Co",
      "status": "new",
      "created_at": "2026-11-19T08:15:30.000Z"
    }
  ],
  "count": 1
}`,
  createLead: `curl -X POST https://<your-domain>/api/integrations/n8n/v1/leads \\
  -H "Authorization: Bearer <api-key-or-access-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "alex@example.com", "first_name": "Alex", "company": "Example Co"}'`,
  createLeadResponse: `{
  "lead": { "id": "b3d51f49-1a2c-4e77-9a01-2f4c8d6e5b70", "email": "alex@example.com", "first_name": "Alex", "company": "Example Co", "status": "new" },
  "duplicate": false
}`,
  authTest: `curl https://<your-domain>/api/integrations/n8n/v1/auth/test \\
  -H "Authorization: Bearer <api-key-or-access-token>"`,
  authTestResponse: `{
  "user": { "id": "51e3f7d2-9c4a-4b1e-8d2f-3a5c6e7b8d90", "email": "owner@example.com" },
  "workspace": { "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "name": "Acme" },
  "scopes": ["n8n.read", "n8n.write"]
}`,
  subscribe: `curl -X POST https://<your-domain>/api/integrations/n8n/v1/webhooks/subscribe \\
  -H "Authorization: Bearer <oauth-access-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"event": "lead.created", "target_url": "https://example.com/hooks/nxtsend"}'`,
  subscribeResponse: `{
  "id": "wh_9f2c1a7b4e5d6f7890abcdef12",
  "event": "lead.created",
  "target_url": "https://example.com/hooks/nxtsend"
}`,
  tokenExchange: `curl -X POST https://<your-domain>/api/muse/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code&code=<code>&code_verifier=<verifier>&client_id=<client_id>&redirect_uri=<redirect_uri>&resource=https://<your-domain>/api/integrations/n8n"`,
  tokenResponse: `{
  "access_token": "<opaque-token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<opaque-token>",
  "scope": "n8n.read n8n.write"
}`,
} as const;
