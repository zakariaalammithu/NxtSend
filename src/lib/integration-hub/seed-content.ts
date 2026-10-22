/**
 * Integration Hub SEED CONTENT (P7 Stage D) — the single source of truth
 * for the preloaded BizReviewRadar (BRR) content.
 *
 * Three consumers mirror this module:
 *   1. the Demo Mode store (`demo-store.ts`) builds its fixtures FROM
 *      these definitions (deterministic demo ids);
 *   2. migration 016's seed section hand-mirrors the same facts for
 *      live installs (all inserts ON CONFLICT DO NOTHING);
 *   3. `__tests__/seed-content.test.ts` pins all three to the same
 *      facts, so the mirrors cannot drift silently.
 *
 * Honesty rules baked into the content itself:
 *   - Source labels: `verified_source` = read from the BRR codebase at
 *     commit 7e12676b (source audit 2026-10-22); `verified_live` = URL
 *     fetched and observed (URL + date recorded); `owner_reported` =
 *     stated by the project owner, NOT independently verified.
 *   - No record is seeded `live` or `approved`. The Muse connector
 *     record is `in_review` per the owner-reported submission snapshot;
 *     every other BRR record is `configuring`.
 *   - Credentials exist ONLY as display-level "expected vault entry"
 *     definitions (metadata) and, in demo, as metadata-only shells.
 *     There are NO credential values anywhere in this module — the
 *     ENTER_REAL_* strings are UI placeholder copy, never values.
 *   - BRR production reality (2026-10-22): the Muse connector is NOT
 *     enabled — its MCP endpoint and both well-known documents return
 *     HTTP 404; live API keys are refused (401 api_key_not_activated).
 */
import type {
  HubChecklistState,
  HubCredentialEnvironment,
  HubCredentialKind,
  HubDocumentKind,
  HubIntegrationStatus,
} from "./hub-core";

export const HUB_SEED_DATE = "2026-10-22";
export const BRR_SOURCE_REF =
  "BRR repo @7e12676b, source audit 2026-10-22";
export const OWNER_REPORTED_BADGE =
  "Owner-reported 2026-10-22 — not independently verified";

// ── Seed shapes ─────────────────────────────────────────────────────────────

export interface HubSeedTool {
  name: string;
  description: string;
  scope: string;
  /** "read" for every Muse tool; inventory entries for other surfaces may use read/write/trigger-style labels. */
  permission: string;
  input_schema: Record<string, unknown>;
  required: string[];
  test_status: "not_tested";
  source: "verified_source";
  source_ref: string;
}

export interface HubSeedVaultEntry {
  label: string;
  kind: HubCredentialKind;
  environment: HubCredentialEnvironment;
  /** UI placeholder copy for the entry form — never a real value. */
  placeholder: string;
  status: "Not configured";
  note: string;
}

export interface HubSeedDocument {
  slug: string;
  title: string;
  kind: HubDocumentKind;
  body: string;
}

export interface HubSeedChecklistItem {
  list_key: string;
  item_key: string;
  title: string;
  detail: string;
  source_ref: string;
  sort_order: number;
}

export interface HubSeedChecklistState {
  list_key: string;
  item_key: string;
  state: HubChecklistState;
  note: string;
}

export interface HubSeedRecord {
  slug: string;
  name: string;
  vendor: string;
  category: string;
  status: HubIntegrationStatus;
  external_status_note: string | null;
  website_url: string | null;
  docs_url: string | null;
  review_portal_url: string | null;
  support_email: string | null;
  summary: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  documents: HubSeedDocument[];
  checklist_items: HubSeedChecklistItem[];
  checklist_states: HubSeedChecklistState[];
}

/** Read a record's display-level expected vault entries from metadata. */
export function expectedVaultEntries(
  record: HubSeedRecord
): HubSeedVaultEntry[] {
  const raw = record.metadata["expected_vault_entries"];
  return Array.isArray(raw) ? (raw as HubSeedVaultEntry[]) : [];
}

// ── The 7 Muse connector tools (verbatim from BRR TOOL_DEFS) ──────────────
// Source: src/routes/api/public/mcp.ts in the BRR repo @7e12676b,
// filtered by MUSE_ALLOWED_TOOL_NAMES (the single allowlist enforced in
// both tools/list and tools/call). Every tool is read-only. The two
// remaining TOOL_DEFS entries — brr.get_analysis (analyses:read) and
// brr.draft_review_reply (review_replies:write) — are NOT on the Muse
// allowlist and exist only on the private MCP surface.

const tool = (
  name: string,
  description: string,
  scope: string,
  input_schema: Record<string, unknown>,
  required: string[]
): HubSeedTool => ({
  name,
  description,
  scope,
  permission: "read",
  input_schema,
  required,
  test_status: "not_tested",
  source: "verified_source",
  source_ref: BRR_SOURCE_REF,
});

export const MUSE_CONNECTOR_TOOLS: HubSeedTool[] = [
  tool(
    "brr.find_business",
    "List BRR businesses the authenticated caller can access. Returns id, name, city. Read-only.",
    "businesses:read",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          maxLength: 200,
          description: "Optional name substring filter",
        },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
    []
  ),
  tool(
    "brr.get_business_profile",
    "Retrieve the authenticated caller's selected BRR business profile. Read-only.",
    "businesses:read",
    { type: "object", additionalProperties: false, properties: {} },
    []
  ),
  tool(
    "brr.get_latest_report",
    "Retrieve the latest stored competitor report for an owned business. Read-only; does not create an analysis or invent history.",
    "reports:read",
    {
      type: "object",
      additionalProperties: false,
      required: ["business_id"],
      properties: {
        business_id: { type: "string", minLength: 8, maxLength: 64 },
      },
    },
    ["business_id"]
  ),
  tool(
    "brr.list_recommendations",
    "List actionable recommendations for a business the caller owns. Read-only.",
    "recommendations:read",
    {
      type: "object",
      additionalProperties: false,
      required: ["business_id"],
      properties: {
        business_id: { type: "string", minLength: 8, maxLength: 64 },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
    ["business_id"]
  ),
  tool(
    "brr.list_competitors",
    "List competitor insights from the latest stored report for an owned business. Read-only; does not create data or invent review history.",
    "businesses:read",
    {
      type: "object",
      additionalProperties: false,
      required: ["business_id"],
      properties: {
        business_id: { type: "string", minLength: 8, maxLength: 64 },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
    ["business_id"]
  ),
  tool(
    "brr.get_report_alert_preferences",
    "Retrieve stored recurring report-alert preferences for the authenticated account. Read-only; reports unavailable when the alert storage has not been migrated.",
    "reports:read",
    { type: "object", additionalProperties: false, properties: {} },
    []
  ),
  tool(
    "brr.list_unanswered_reviews",
    "List stored, currently present owned Google Business Profile reviews with no recorded reply. Read-only; returns an empty list when trustworthy synced data is unavailable.",
    "businesses:read",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
    []
  ),
];

export const MUSE_REDIRECT_URI =
  "https://agent.meta.ai/api/hatch/oauth/callback";

export const REST_API_CURL_EXAMPLE =
  'curl -sS "https://bizreviewradar.com/api/v1/integration-test" -H "Authorization: Bearer ${BRR_TEST_API_KEY}"';

export const CLIENT_CREDENTIALS_CURL_EXAMPLE =
  'curl -sS "https://bizreviewradar.com/api/oauth/token" -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=client_credentials" -d "client_id=${BRR_CC_CLIENT_ID}" -d "client_secret=${BRR_CC_CLIENT_SECRET}"';

export const LEGAL_LINKS = [
  { label: "Muse Connector Platform", url: "https://platform.muse.ai/" },
  { label: "Muse Connector guidelines", url: "https://platform.muse.ai/docs" },
  { label: "Muse Connector Terms", url: "https://platform.muse.ai/terms" },
  { label: "BRR Privacy Policy", url: "https://bizreviewradar.com/privacy" },
  { label: "BRR Terms & Conditions", url: "https://bizreviewradar.com/terms" },
] as const;

/**
 * Legal-link reachability, checked once on 2026-10-22 (Stage D):
 * all five URLs returned real page content. Recorded here so the
 * seeded compliance document can state the check and its date.
 */
export const LEGAL_LINK_CHECK = {
  checked_on: HUB_SEED_DATE,
  results: [
    { url: "https://platform.muse.ai/", reachable: true, note: "Muse Platform page loads." },
    { url: "https://platform.muse.ai/docs", reachable: true, note: "Connector guidelines page loads." },
    { url: "https://platform.muse.ai/terms", reachable: true, note: "Connector Terms page loads (Sections 4.3(b) and 4.3(f) confirm the two term-derived requirements below)." },
    { url: "https://bizreviewradar.com/privacy", reachable: true, note: "Privacy Policy loads (page states: Last updated June 2026)." },
    { url: "https://bizreviewradar.com/terms", reachable: true, note: "Terms & Conditions load (page states: Last updated May 2026)." },
  ],
} as const;

export const TERM_DERIVED_REQUIREMENTS = [
  "Process user data only as necessary for the connector request, and delete it or make it inaccessible when access is revoked, deletion is requested, or it is no longer necessary — whichever comes first. (Muse Connector Terms §4.3(a)/(f): https://platform.muse.ai/terms)",
  "Notify Meta within 48 hours of any security incident involving User Data. (Muse Connector Terms §4.3(b) and Connector guidelines §4.8: https://platform.muse.ai/terms)",
] as const;

// ── Checklists for the Muse connector record ────────────────────────────────

const COMPLIANCE_SOURCE_REF =
  "Muse Connector Terms §4 + Connector guidelines §4 (platform.muse.ai/terms, platform.muse.ai/docs — fetched 2026-10-22, verified_live)";

const metaItem = (
  item_key: string,
  title: string,
  detail: string,
  sort_order: number,
  source_ref = "Meta Muse Connector Platform submission (platform.muse.ai/docs §5–6, fetched 2026-10-22)"
): HubSeedChecklistItem => ({
  list_key: "meta-submission",
  item_key,
  title,
  detail,
  source_ref,
  sort_order,
});

const complianceItem = (
  item_key: string,
  title: string,
  detail: string,
  sort_order: number
): HubSeedChecklistItem => ({
  list_key: "security-compliance",
  item_key,
  title,
  detail,
  source_ref: COMPLIANCE_SOURCE_REF,
  sort_order,
});

/**
 * Submission tracker for the Muse connector. The FIRST SIX items are
 * the owner-reported snapshot states (2026-10-22); their state rows are
 * seeded in `checklist_states` with the owner-reported badge as the
 * note. They are a snapshot, not a verification. The remaining 14 are
 * the manual checklist — all todo except the reviewer/test-account
 * item, which starts blocked because the account and its `api_demo`
 * entitlement are owner-side.
 */
export const META_SUBMISSION_ITEMS: HubSeedChecklistItem[] = [
  metaItem("snapshot-business-verification", "Business verification: Approved", "Snapshot state from the Meta submission. Badge: owner-reported.", 0, "owner_reported 2026-10-22"),
  metaItem("snapshot-data-processing-questionnaire", "Data processing questionnaire: In review", "Snapshot state from the Meta submission (resubmitted). Badge: owner-reported.", 1, "owner_reported 2026-10-22"),
  metaItem("snapshot-integration-credentials", "Integration credentials: In review", "Snapshot state from the Meta submission. Badge: owner-reported.", 2, "owner_reported 2026-10-22"),
  metaItem("snapshot-overall-submission", "Overall submission: Submitted / in review", "Snapshot state: connector 'Biz Review Radar' submitted 2026-10-20. Badge: owner-reported.", 3, "owner_reported 2026-10-22"),
  metaItem("snapshot-end-to-end-testing", "End-to-end testing: Not yet verified", "No end-to-end test has been verified complete. Production endpoints return 404 today, so no live test is possible yet.", 4, "owner_reported 2026-10-22"),
  metaItem("snapshot-final-approval", "Final approval: Not confirmed", "Final Meta approval has NOT been confirmed. This connector must never be described as Approved or Live without verified evidence.", 5, "owner_reported 2026-10-22"),
  metaItem("reviewing-meta-feedback", "Reviewing feedback from Meta", "Read and act on any reviewer feedback in the Meta submission portal.", 6),
  metaItem("confirming-callback-uri", "Confirming callback URI", "Verify the redirect URI registered in the BRR OAuth app against the current Meta Credentials Integration setup. The recorded URI is recorded_unverified: it does not appear in the BRR codebase and has not been confirmed by Meta.", 7),
  metaItem("confirming-credentials", "Confirming credentials", "Enter the real OAuth client ID and client secret into the Hub vault (Credentials tab). The secret was issued once by BRR; the owner reported saving it. Placeholder text is never a credential.", 8),
  metaItem("preparing-reviewer-test-account", "Preparing a dedicated BRR reviewer/test account", "A dedicated reviewer/test account must exist in BRR before Meta can test the connector. Not created yet.", 9),
  metaItem("confirming-required-entitlement", "Confirming the required entitlement", "The reviewer account needs the api_demo entitlement (or an admin plan): the api_demo policy gates all authenticated API paths and Muse MCP calls in the current BRR build.", 10),
  metaItem("testing-account-linking", "Testing account linking", "Complete a full account-linking flow with the reviewer account once production flags are enabled.", 11),
  metaItem("testing-oauth-flow", "Testing OAuth authorization and token exchange", "Authorization code + PKCE S256 exchange, refresh rotation, and error paths.", 12),
  metaItem("testing-each-tool", "Testing each approved Muse tool", "All 7 allowlisted tools (test_status is not_tested until this is done).", 13),
  metaItem("testing-revocation", "Testing revocation and expired tokens", "RFC 7009 revocation and expired-token behaviour. Note: revocation is flag-gated in BRR — it returns 404 while the auth-code flag is off.", 14),
  metaItem("verifying-tenant-isolation", "Verifying tenant isolation", "Confirm one account can never see another account's businesses, reports, or reviews through any tool.", 15),
  metaItem("reviewing-failure-handling", "Reviewing failure handling and error responses", "Error shapes for auth failures, scope failures, unknown tools, and disabled flags.", 16),
  metaItem("reviewing-tool-classifications", "Reviewing tool descriptions and read/write classifications", "All 7 tools are read-only; descriptions must stay factual (Connector guidelines §3).", 17),
  metaItem("confirming-submission-documentation", "Confirming submission documentation", "Submission docs match the implemented behaviour (guidelines §5.4).", 18),
  metaItem("confirming-flags-rollback", "Confirming production flags and rollback plan before activation", "The three readiness conditions (MUSE_CONNECTOR_PUBLIC_ORIGIN, muse_mcp_enabled, oauth_authcode_enabled) plus a rollback plan, before anything is enabled in production.", 19),
];

export const META_SUBMISSION_STATES: HubSeedChecklistState[] = [
  { list_key: "meta-submission", item_key: "snapshot-business-verification", state: "done", note: OWNER_REPORTED_BADGE },
  { list_key: "meta-submission", item_key: "snapshot-data-processing-questionnaire", state: "in_progress", note: OWNER_REPORTED_BADGE },
  { list_key: "meta-submission", item_key: "snapshot-integration-credentials", state: "in_progress", note: OWNER_REPORTED_BADGE },
  { list_key: "meta-submission", item_key: "snapshot-overall-submission", state: "in_progress", note: OWNER_REPORTED_BADGE },
  { list_key: "meta-submission", item_key: "snapshot-end-to-end-testing", state: "todo", note: OWNER_REPORTED_BADGE },
  { list_key: "meta-submission", item_key: "snapshot-final-approval", state: "todo", note: OWNER_REPORTED_BADGE },
  {
    list_key: "meta-submission",
    item_key: "preparing-reviewer-test-account",
    state: "blocked",
    note: "Blocked — owner-side: the dedicated reviewer/test account does not exist yet, and its api_demo entitlement must be granted by the BRR account owner.",
  },
];

/**
 * The Muse compliance checklist (18 items). NOTE: the Stage D brief
 * said 17 items; the master prompt's Part 9.1 list enumerates 18 —
 * all 18 are seeded, and the discrepancy is flagged in the Stage D
 * report. Every item starts todo (no state rows are seeded).
 */
export const SECURITY_COMPLIANCE_ITEMS: HubSeedChecklistItem[] = [
  complianceItem("submission-accuracy", "Submission accuracy", "Everything submitted to Meta is true, accurate, and does not misrepresent the connector's functionality or compliance (Connector Terms §2.1).", 0),
  complianceItem("public-privacy-notice", "Public privacy notice", "A publicly accessible privacy notice covers the connector's processing of personal data (Connector Terms §4.3(c)). BRR's notice: https://bizreviewradar.com/privacy", 1),
  complianceItem("authorized-account-access", "Authorized account access", "The connector only accesses accounts the user has authorized, within the scopes granted.", 2),
  complianceItem("least-privilege-scopes", "Least-privilege scopes", "Requested scopes are the minimum required: exactly businesses:read, reports:read, recommendations:read.", 3),
  complianceItem("tenant-isolation", "Tenant and business data isolation", "Each user's/business's data is isolated; no cross-tenant reads through any tool.", 4),
  complianceItem("encryption-in-transit", "Encryption in transit", "All connector traffic is encrypted in transit (HTTPS only).", 5),
  complianceItem("sensitive-data-at-rest", "Sensitive data protection at rest", "Sensitive data is encrypted at rest; credentials are never stored in plaintext.", 6),
  complianceItem("credential-security", "Credential security", "Client secrets and tokens are protected, never exposed in prompts, tool descriptions, URLs, analytics, or logs (guidelines §4.4).", 7),
  complianceItem("access-revocation", "Access revocation", "Access stops when authorization is revoked; revocation endpoint behaves per RFC 7009.", 8),
  complianceItem("data-deletion", "Data deletion or inaccessibility", "User data is deleted or made inaccessible on revocation, on deletion request, or when no longer necessary — whichever comes first (Terms §4.3(f)).", 9),
  complianceItem("retention-limited", "Data retention limited to the user request", "User data is retained only as long as necessary to fulfill the user's request (Terms §4.3(f)).", 10),
  complianceItem("subprocessor-disclosure", "Subprocessor disclosure", "Processors/subprocessors are disclosed in the privacy documentation. Owner to confirm the current list — none is asserted by this seed.", 11),
  complianceItem("international-transfers", "International data-transfer arrangements where applicable", "Transfer arrangements are documented where data crosses borders. Owner to confirm — none is asserted by this seed.", 12),
  complianceItem("government-request-handling", "Government and third-party request handling", "A procedure exists for government/third-party data requests. Owner to confirm — none is asserted by this seed.", 13),
  complianceItem("incident-response", "Incident response", "Meta is notified within 48 hours of a security incident involving User Data (Terms §4.3(b); guidelines §4.8).", 14),
  complianceItem("reviewer-account-availability", "Reviewer/test account availability", "A dedicated test account with representative data stays accessible throughout review (guidelines §5.5). Currently blocked — see the submission tracker.", 15),
  complianceItem("tool-permission-classification", "Tool permission classification", "Every tool is classified Read / Write / Sensitive write; all 7 Muse tools are Read (guidelines §3.2).", 16),
  complianceItem("supported-capabilities-documentation", "Correct documentation of supported capabilities", "Documentation states only what the connector actually supports — no live/verified claims without evidence.", 17),
];

// ── Documents for the Muse connector record ─────────────────────────────────

function museManifestBody(): string {
  const toolBlocks = MUSE_CONNECTOR_TOOLS.map((t) =>
    [
      `### ${t.name}`,
      "",
      `- Description (verbatim from BRR source): ${t.description}`,
      `- Required scope: \`${t.scope}\``,
      `- Permission: ${t.permission} (read-only)`,
      `- Test status: ${t.test_status}`,
      `- Source: ${t.source} — ${t.source_ref}`,
      "",
      "```json",
      JSON.stringify(t.input_schema, null, 2),
      "```",
    ].join("\n")
  ).join("\n\n");
  return [
    "# BizReviewRadar Muse Connector — Manifest",
    "",
    `Source of truth: BRR codebase @7e12676b (source audit ${HUB_SEED_DATE}). Status: connector submitted to Meta, in review (${OWNER_REPORTED_BADGE.toLowerCase()}). Production is NOT enabled: on ${HUB_SEED_DATE} the MCP endpoint and both well-known documents returned HTTP 404.`,
    "",
    "## Identity",
    "",
    "- Name: BizReviewRadar Muse Connector",
    "- Provider: Meta Muse Connector Platform",
    "- Vendor: BizReviewRadar",
    "- Connection category: Existing MCP",
    "- Client type: confidential (dynamic client registration is NOT supported — clients are pre-registered in BRR)",
    "- Permission profile: Read-only",
    "",
    "## Endpoints",
    "",
    "- MCP endpoint: https://bizreviewradar.com/api/public/muse/mcp",
    "- Protected-resource metadata: https://bizreviewradar.com/.well-known/oauth-protected-resource/api/public/muse/mcp",
    "- Authorization-server metadata: https://bizreviewradar.com/.well-known/oauth-authorization-server",
    "- Authorization endpoint: https://bizreviewradar.com/api/oauth/authorize",
    "- Token endpoint: https://bizreviewradar.com/api/oauth/token",
    "- Revocation endpoint: https://bizreviewradar.com/api/oauth/revoke",
    "- OAuth documentation: https://bizreviewradar.com/developers/oauth",
    "- Developer portal: https://bizreviewradar.com/developers",
    "- Authenticated developer portal: https://bizreviewradar.com/app/developers",
    "",
    "## Protocol",
    "",
    "- MCP protocol version: 2025-06-18",
    "- Transport: Streamable HTTP",
    "- Format: JSON-RPC 2.0",
    "- RFC 9207: authorization responses carry the `iss` parameter; metadata advertises authorization_response_iss_parameter_supported",
    "- Resource/audience validation: tokens are audience-bound to the Muse MCP resource (RFC 8707)",
    "",
    "## Scopes (exact — the closed Muse profile)",
    "",
    "- businesses:read",
    "- reports:read",
    "- recommendations:read",
    "",
    "No other scope is a Muse connector scope. reviews:read / reviews:reply do not exist in any BRR scope enum; analyses:read belongs to the broader BRR API profile only.",
    "",
    "## Redirect URI",
    "",
    `- Registered redirect URI (recorded): ${MUSE_REDIRECT_URI}`,
    "- Status: recorded_unverified — registered in the BRR OAuth app per the owner; the URI does not appear anywhere in the BRR codebase (it would be database-only), and Meta has not confirmed it. Verify it against the current Meta Credentials Integration setup before relying on it.",
    "",
    "## Readiness (all three conditions required)",
    "",
    "1. MUSE_CONNECTOR_PUBLIC_ORIGIN is configured in BRR production.",
    "2. The muse_mcp_enabled flag is on.",
    "3. The oauth_authcode_enabled flag is on.",
    "",
    `Live evidence ${HUB_SEED_DATE}: the MCP endpoint and both well-known documents return HTTP 404, so the connector is not enabled in production today.`,
    "",
    "## Tools (7 — the complete Muse allowlist)",
    "",
    toolBlocks,
    "",
    "## Excluded tools (NOT in this connector)",
    "",
    "Two further tools exist in BRR's TOOL_DEFS but are deliberately excluded from the Muse allowlist and exist only on the private MCP surface (/api/public/mcp, gated by a separate flag):",
    "",
    "- brr.get_analysis (analyses:read) — retrieves a stored analysis by id.",
    "- brr.draft_review_reply (review_replies:write) — generates an AI review-reply DRAFT; never publishes.",
    "",
    "They must not be documented or submitted as Muse connector tools.",
  ].join("\n");
}

const MUSE_SETUP_GUIDE_BODY = [
  "# BizReviewRadar Muse Connector — Setup Guide",
  "",
  "How the operator completes this connector's configuration in the Hub. Nothing here is automatic: credentials are entered by hand, and production activation is a separate, owner-authorised BRR change.",
  "",
  "## 1. Enter the OAuth credentials",
  "",
  "In the Credentials tab of this record, add the two expected vault entries:",
  "",
  "- OAuth client ID (kind: oauth_client_id, environment: production) — replace the ENTER_REAL_CLIENT_ID placeholder with the real client ID from the BRR OAuth app named 'BizReviewRadar Muse Connector'.",
  "- OAuth client secret (kind: client_secret, environment: production) — replace ENTER_REAL_CLIENT_SECRET with the real secret. BRR issued this secret once; the owner reported saving it at issue time. If it is lost, rotate it in the BRR developer portal and enter the new value here.",
  "",
  "Placeholder text (ENTER_REAL_*) is form guidance only — the Hub refuses to save it as a value.",
  "",
  "## 2. Confirm the redirect URI",
  "",
  `The recorded redirect URI is ${MUSE_REDIRECT_URI} with status recorded_unverified. Open the Meta Credentials Integration setup for this connector and confirm the URI matches exactly what Meta expects; correct the BRR OAuth app registration if it does not.`,
  "",
  "## 3. Prepare the reviewer account (owner-side, currently blocked)",
  "",
  "- Create a dedicated BRR reviewer/test account.",
  "- Grant it the api_demo entitlement (or an admin plan) — the api_demo policy gates every authenticated API path and Muse MCP call in the current BRR build.",
  "- Record the account in this record's Test Accounts section (structure only in this seed — no account exists yet). Store its password as a vault credential of kind test_account_password; never type it into a note.",
  "",
  "## 4. Production activation (BRR-side, NOT done)",
  "",
  "All three readiness conditions must hold in BRR production: MUSE_CONNECTOR_PUBLIC_ORIGIN configured, muse_mcp_enabled on, oauth_authcode_enabled on. Enabling them is a production change in the BRR project and needs the owner's explicit authorisation there — the Hub never flips BRR flags.",
  "",
  "## 5. Test in order",
  "",
  "Account linking → OAuth authorization + token exchange (PKCE S256) → each of the 7 tools → revocation + expired tokens → tenant isolation → failure handling. Update the tracker states in the Testing/Submission checklist as each step is genuinely completed.",
].join("\n");

const PRIVACY_RETENTION_BODY = [
  "# Privacy & Data Retention Record — BizReviewRadar Muse Connector",
  "",
  "Part 9.2 record. Every field below is intentionally EMPTY / owner-to-confirm: this seed asserts no data practices, processors, countries, or retention periods that have not been verified. The owner completes this record from BRR's actual practices before submission sign-off.",
  "",
  "- Personal data categories: Owner to confirm",
  "- Sensitive data categories: Owner to confirm",
  "- Purposes of processing: Owner to confirm",
  "- Processors / subprocessors: Owner to confirm",
  "- Storage / access countries: Owner to confirm",
  "- Retention period: Owner to confirm",
  "- Revocation handling: Owner to confirm",
  "- Deletion procedure: Owner to confirm",
  "- Security controls: Owner to confirm",
  "- International transfer controls: Owner to confirm",
  "- Government request procedure: Owner to confirm",
  "- Last verification date: Not yet verified",
  "",
  "Reference points the owner can verify against (fetched 2026-10-22, reachable):",
  "",
  "- BRR Privacy Policy: https://bizreviewradar.com/privacy (page states: Last updated June 2026; it describes developer-credential storage — API keys hashed, OAuth/webhook secrets encrypted at rest — and data export/deletion by email request).",
  "- BRR Terms & Conditions: https://bizreviewradar.com/terms (page states: Last updated May 2026).",
  "- Muse Connector Terms §4.3: https://platform.muse.ai/terms — the obligations this record must be consistent with.",
].join("\n");

const COMPLIANCE_NOTES_BODY = [
  "# Compliance Notes — Term-Derived Requirements & Legal Links",
  "",
  "## Term-derived requirements (Muse Connector Terms, fetched 2026-10-22)",
  "",
  ...TERM_DERIVED_REQUIREMENTS.map((r) => `- ${r}`),
  "",
  "## Legal links — reachability checked once on 2026-10-22",
  "",
  ...LEGAL_LINK_CHECK.results.map(
    (r) => `- ${r.url} — ${r.reachable ? "reachable" : "UNREACHABLE (flagged)"}. ${r.note}`
  ),
  "",
  "All five links were reachable on the check date; none is flagged unreachable. Re-check before submission sign-off — a link that later breaks must be flagged here, not silently kept.",
  "",
  "## Submission snapshot (for reference)",
  "",
  `The Meta submission state recorded in the tracker is ${OWNER_REPORTED_BADGE.toLowerCase()}: business verification Approved; data processing questionnaire In review; integration credentials In review; overall Submitted / in review; end-to-end testing not yet verified; final approval not confirmed.`,
].join("\n");

// ── Record (a): the Muse connector ──────────────────────────────────────────

const BRR_MUSE_CONNECTOR: HubSeedRecord = {
  slug: "brr-muse-connector",
  name: "BizReviewRadar Muse Connector",
  vendor: "BizReviewRadar",
  category: "connector",
  status: "in_review",
  external_status_note:
    "Meta submission: Submitted / in review (connector 'Biz Review Radar', submitted 2026-10-20). Owner-reported snapshot 2026-10-22 — not independently verified. Production is NOT enabled: the MCP endpoint and both well-known documents returned HTTP 404 on 2026-10-22.",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers/oauth",
  review_portal_url: "https://bizreviewradar.com/app/developers",
  support_email: null,
  summary:
    "BRR's read-only MCP connector for the Meta Muse Connector Platform: 7 allowlisted tools over OAuth 2.0 Authorization Code + PKCE, audience-bound to the Muse MCP resource. Implemented and hardened in the BRR codebase (@7e12676b) but not enabled in production — activation needs all three readiness conditions and the owner's separate authorisation in the BRR project.",
  sort_order: 0,
  metadata: {
    provider: "Meta Muse Connector Platform",
    auth_method: "OAuth 2.0 Authorization Code + PKCE S256",
    client_type: "confidential",
    dynamic_client_registration: "not_supported",
    connection_category: "Existing MCP",
    permission_profile: "Read-only",
    base_url: "https://bizreviewradar.com",
    endpoints: [
      { label: "MCP endpoint", url: "https://bizreviewradar.com/api/public/muse/mcp", method: "POST", notes: "Streamable HTTP, JSON-RPC 2.0. Returns 404 while the connector is not ready (verified live 2026-10-22)." },
      { label: "Protected-resource metadata", url: "https://bizreviewradar.com/.well-known/oauth-protected-resource/api/public/muse/mcp", method: "GET", notes: "RFC 9728. Returns 404 while not ready (verified live 2026-10-22)." },
      { label: "Authorization-server metadata", url: "https://bizreviewradar.com/.well-known/oauth-authorization-server", method: "GET", notes: "Returns 404 while not ready (verified live 2026-10-22)." },
      { label: "Authorization endpoint", url: "https://bizreviewradar.com/api/oauth/authorize", method: "GET" },
      { label: "Token endpoint", url: "https://bizreviewradar.com/api/oauth/token", method: "POST" },
      { label: "Revocation endpoint", url: "https://bizreviewradar.com/api/oauth/revoke", method: "POST", notes: "RFC 7009; flag-gated — 404 while the auth-code flag is off." },
      { label: "OAuth documentation", url: "https://bizreviewradar.com/developers/oauth" },
      { label: "Developer portal", url: "https://bizreviewradar.com/developers" },
      { label: "Authenticated developer portal", url: "https://bizreviewradar.com/app/developers" },
    ],
    redirect_uris: [MUSE_REDIRECT_URI],
    redirect_uri_status: "recorded_unverified",
    scope_profile: "muse",
    scopes: ["businesses:read", "reports:read", "recommendations:read"],
    tool_inventory: MUSE_CONNECTOR_TOOLS,
    protocol: {
      mcp_version: "2025-06-18",
      transport: "Streamable HTTP",
      format: "JSON-RPC 2.0",
      rfc9207_iss: true,
      audience_validation:
        "Tokens are audience-bound to the Muse MCP resource (RFC 8707 resource validation).",
    },
    readiness: {
      conditions: [
        "MUSE_CONNECTOR_PUBLIC_ORIGIN configured in BRR production",
        "muse_mcp_enabled flag on",
        "oauth_authcode_enabled flag on",
      ],
      live_evidence:
        "2026-10-22: MCP endpoint, protected-resource metadata, and authorization-server metadata all returned HTTP 404 — the connector is not enabled in production.",
    },
    compliance_links: LEGAL_LINKS.map((l) => ({ ...l })),
    legal: {
      privacy_url: "https://bizreviewradar.com/privacy",
      terms_url: "https://bizreviewradar.com/terms",
    },
    compliance_notes: [...TERM_DERIVED_REQUIREMENTS],
    expected_vault_entries: [
      {
        label: "Muse OAuth client ID",
        kind: "oauth_client_id",
        environment: "production",
        placeholder: "ENTER_REAL_CLIENT_ID",
        status: "Not configured",
        note: "Client ID of the BRR OAuth app 'BizReviewRadar Muse Connector' (confidential client). Enter the real value in the vault — it has not been entered yet.",
      },
      {
        label: "Muse OAuth client secret",
        kind: "client_secret",
        environment: "production",
        placeholder: "ENTER_REAL_CLIENT_SECRET",
        status: "Not configured",
        note: "Issued once by BRR when the OAuth app was created; the owner reported saving it. If lost, rotate it in the BRR developer portal. Never the client-credentials population's secret (see the BRR OAuth record).",
      },
    ] as HubSeedVaultEntry[],
    known_limitations: [
      "Not enabled in production: MCP endpoint and both well-known documents return 404 until all three readiness conditions hold.",
      "Excluded tools: brr.get_analysis and brr.draft_review_reply exist only on BRR's private MCP surface — they are not part of this connector and must not be submitted as Muse tools.",
      "Dynamic client registration is not supported; the client is pre-registered in BRR.",
      "Live BRR API keys are refused in the current demo phase (see the BRR REST API record) — the reviewer account needs the api_demo entitlement.",
      "The recorded redirect URI is unverified on the Meta side (recorded_unverified).",
    ],
    notes_blockers:
      "Production activation is blocked on BRR-side conditions, none of which this Hub can change: (1) MUSE_CONNECTOR_PUBLIC_ORIGIN not confirmed configured, (2) muse_mcp_enabled off, (3) oauth_authcode_enabled off — live evidence 2026-10-22: MCP endpoint + both well-knowns return 404. Also: redirect URI unconfirmed on the Meta side; Meta review pending; live API keys refused (401 api_key_not_activated, demo phase); the dedicated reviewer/test account does not exist yet; BRR Gate-1 staging verification from the BRR project history was never performed.",
    notes_requirements:
      "Owner-side: the real OAuth client ID + client secret (secret issued once by BRR, owner reported saving it); a dedicated BRR reviewer/test account with the api_demo entitlement (or an admin plan); Meta Credentials Integration access to confirm the redirect URI.",
    notes_redirect_status:
      `Recorded redirect URI ${MUSE_REDIRECT_URI} — status recorded_unverified. Registered in the BRR OAuth app per the owner; absent from the BRR codebase (database-only if present); NOT confirmed by Meta. Verify against the current Meta Credentials Integration setup.`,
    notes_test_account_status:
      "No reviewer/test account exists yet (seeded empty on purpose). Creating it and granting api_demo are owner-side — see the blocked tracker item 'Preparing a dedicated BRR reviewer/test account'.",
    notes_required_items:
      "Names only: Muse OAuth client ID; Muse OAuth client secret (issued once by BRR); reviewer account credentials (password stored only as a vault entry of kind test_account_password). Never paste values into notes.",
    notes_manual_instructions:
      "See the seeded Setup Guide document: enter credentials in the vault, confirm the redirect URI in Meta's setup, prepare the reviewer account + entitlement, then — only with the owner's separate BRR authorisation — enable the three readiness conditions and test in order.",
    notes_last_test:
      "No successful end-to-end test yet. Source-level verification only (BRR repo @7e12676b, 2026-10-22); live endpoints return 404, so no live test is possible today.",
    notes_review_stage:
      "Submitted / in review at Meta (owner-reported snapshot 2026-10-22): business verification Approved; data processing questionnaire In review (resubmitted); integration credentials In review; end-to-end testing not yet verified; final approval not confirmed.",
    notes_remaining_actions:
      "Confirm callback URI + credentials with Meta; create the reviewer account and grant api_demo; after BRR activation: test linking, OAuth exchange, all 7 tools, revocation/expiry, tenant isolation, failure handling; complete the privacy & data-retention record (all fields owner-to-confirm).",
  },
  documents: [
    {
      slug: "brr-muse-connector-manifest",
      title: "BizReviewRadar Muse Connector — Manifest",
      kind: "manifest",
      body: museManifestBody(),
    },
    {
      slug: "brr-muse-connector-setup",
      title: "BizReviewRadar Muse Connector — Setup Guide",
      kind: "doc",
      body: MUSE_SETUP_GUIDE_BODY,
    },
    {
      slug: "brr-privacy-data-retention",
      title: "Privacy & Data Retention Record — BizReviewRadar Muse Connector",
      kind: "policy",
      body: PRIVACY_RETENTION_BODY,
    },
    {
      slug: "brr-muse-compliance-notes",
      title: "Compliance Notes — Term-Derived Requirements & Legal Links",
      kind: "note",
      body: COMPLIANCE_NOTES_BODY,
    },
  ],
  checklist_items: [...META_SUBMISSION_ITEMS, ...SECURITY_COMPLIANCE_ITEMS],
  checklist_states: META_SUBMISSION_STATES,
};

// ── Record (b): BRR REST API ────────────────────────────────────────────────

const REST_API_GUIDE_BODY = [
  "# BRR REST API — Guide",
  "",
  `Source: BRR codebase @7e12676b (source audit ${HUB_SEED_DATE}).`,
  "",
  "## Base URL",
  "",
  "https://bizreviewradar.com/api/v1",
  "",
  "(BRR's Terms note a dedicated api.bizreviewradar.com host is planned but NOT live — do not use it.)",
  "",
  "## Authentication",
  "",
  "Bearer API keys created in the BRR developer portal. Key prefixes: brr_test_ (test) and brr_live_ (live). Keys are shown once at creation; BRR stores only a hash.",
  "",
  "## Verified limitation — live keys are refused today",
  "",
  "In the current demo phase the API refuses every live key: a brr_live_ key gets HTTP 401 with error code api_key_not_activated (\"Live API keys are not yet enabled.\", src/lib/api-v1.server.ts @7e12676b). Only brr_test_ keys work. Do not plan a production cutover on live keys until BRR enables them.",
  "",
  "## Smoke test (test key)",
  "",
  "```bash",
  REST_API_CURL_EXAMPLE,
  "```",
  "",
  "Replace the placeholder with a real test key from the vault at run time — never commit a real key into a document or script.",
  "",
  "## Scopes",
  "",
  "API keys carry scopes from the closed BRR API profile (API_KEY_SCOPES in BRR source): businesses:read, analyses:read, analyses:write, reports:read, recommendations:read, review_replies:write, webhooks:manage.",
  "",
  "## Links",
  "",
  "- Developer portal: https://bizreviewradar.com/developers",
  "- Authenticated developer portal: https://bizreviewradar.com/app/developers",
  "- OAuth documentation: https://bizreviewradar.com/developers/oauth",
].join("\n");

const BRR_REST_API: HubSeedRecord = {
  slug: "brr-rest-api",
  name: "BizReviewRadar REST API",
  vendor: "BizReviewRadar",
  category: "api",
  status: "configuring",
  external_status_note:
    "Test keys work; live keys are refused in the current demo phase (401 api_key_not_activated — source-verified 2026-10-22).",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers",
  review_portal_url: "https://bizreviewradar.com/app/developers",
  support_email: null,
  summary:
    "BRR's versioned REST API (base https://bizreviewradar.com/api/v1), authenticated with Bearer API keys (brr_test_ / brr_live_ prefixes). Documented from the BRR source @7e12676b; no key has been entered into the Hub yet.",
  sort_order: 1,
  metadata: {
    auth_method: "Bearer API key",
    base_url: "https://bizreviewradar.com/api/v1",
    endpoints: [
      { label: "API base URL", url: "https://bizreviewradar.com/api/v1" },
      { label: "Integration test endpoint", url: "https://bizreviewradar.com/api/v1/integration-test", method: "GET", notes: "Auth smoke test for a key (also used by the Zapier app)." },
      { label: "Developer portal / API reference", url: "https://bizreviewradar.com/developers" },
      { label: "Authenticated developer portal", url: "https://bizreviewradar.com/app/developers" },
    ],
    prefixes: ["brr_test_", "brr_live_"],
    curl_example: REST_API_CURL_EXAMPLE,
    scope_profile: "brr_api",
    scopes: [
      "businesses:read",
      "analyses:read",
      "analyses:write",
      "reports:read",
      "recommendations:read",
      "review_replies:write",
      "webhooks:manage",
    ],
    expected_vault_entries: [
      {
        label: "BRR test API key",
        kind: "api_key",
        environment: "test",
        placeholder: "ENTER_REAL_API_KEY",
        status: "Not configured",
        note: "A brr_test_ key from the BRR developer portal. Test keys are the only keys the API accepts in the current demo phase.",
      },
      {
        label: "BRR live API key",
        kind: "api_key",
        environment: "production",
        placeholder: "ENTER_REAL_API_KEY",
        status: "Not configured",
        note: "Shell only: live (brr_live_) keys are currently REFUSED by the API — HTTP 401 api_key_not_activated, 'Live API keys are not yet enabled.' (source-verified 2026-10-22). Enter a live key only after BRR enables live keys.",
      },
    ] as HubSeedVaultEntry[],
    known_limitations: [
      "Live keys refused today: 401 api_key_not_activated (demo phase, source-verified). Only test keys work.",
      "The api_demo policy gates authenticated API paths in the current build; an account without the entitlement cannot use the API.",
    ],
    notes_blockers:
      "Live-key activation is a BRR-side change (demo phase). Nothing in the Hub can enable it.",
    notes_last_test:
      "Not tested from the Hub — no key entered yet. Source-verified behaviour only (@7e12676b, 2026-10-22).",
  },
  documents: [
    { slug: "brr-rest-api-guide", title: "BRR REST API — Guide", kind: "doc", body: REST_API_GUIDE_BODY },
  ],
  checklist_items: [],
  checklist_states: [],
};

// ── Record (c): BRR OAuth ───────────────────────────────────────────────────

const OAUTH_GUIDE_BODY = [
  "# BRR OAuth 2.0 — Guide",
  "",
  `Source: BRR codebase @7e12676b (source audit ${HUB_SEED_DATE}): src/routes/api/oauth/token.ts header + src/lib/oauth-authcode.server.ts.`,
  "",
  "## Endpoints",
  "",
  "- Authorize: https://bizreviewradar.com/api/oauth/authorize",
  "- Token: https://bizreviewradar.com/api/oauth/token",
  "- Revoke: https://bizreviewradar.com/api/oauth/revoke (RFC 7009)",
  "- Authorization-server metadata: https://bizreviewradar.com/.well-known/oauth-authorization-server",
  "- Documentation: https://bizreviewradar.com/developers/oauth",
  "",
  "## Grants — two separate client populations, never conflated",
  "",
  "### 1. Authorization code + PKCE (user-delegated; the Muse connector flow)",
  "",
  "- grant_type=authorization_code with PKCE S256 only, and grant_type=refresh_token (rotation with reuse detection — reusing a rotated refresh token revokes the token family).",
  "- GATED by the oauth_authcode_enabled flag, which is OFF in production today: with the flag off, the token endpoint returns unsupported_grant_type for these grants, and revocation returns 404.",
  "- Clients are the OAuth APPS registered in the BRR developer portal (e.g. the 'BizReviewRadar Muse Connector' app — see the Muse connector record for its credentials).",
  "",
  "### 2. Client credentials (machine-to-machine; always on)",
  "",
  "- grant_type=client_credentials is always enabled and predates the auth-code flow.",
  "- It uses a SEPARATE oauth_clients population — not developer-portal OAuth apps, and NOT the Muse connector app's credentials. Keep its credentials in this record's vault entries, never in the Muse record.",
  "",
  "Placeholder example (client credentials):",
  "",
  "```bash",
  CLIENT_CREDENTIALS_CURL_EXAMPLE,
  "```",
  "",
  "## Scope catalogue (from the BRR code enum — authoritative)",
  "",
  "API_KEY_SCOPES in src/lib/api-keys.server.ts: businesses:read, analyses:read, analyses:write, reports:read, recommendations:read, review_replies:write, webhooks:manage.",
  "",
  "Documentation discrepancy (flagged): BRR's live /developers/oauth page lists a 'replies:write' scope. That scope does not exist in the code enum — the real scope is review_replies:write. Trust the code, not the page, until BRR fixes the page.",
  "",
  "The Muse connector uses only the 3-scope subset (businesses:read, reports:read, recommendations:read) — see the Muse connector record.",
].join("\n");

const BRR_OAUTH: HubSeedRecord = {
  slug: "brr-oauth",
  name: "BizReviewRadar OAuth 2.0",
  vendor: "BizReviewRadar",
  category: "oauth",
  status: "configuring",
  external_status_note:
    "Client-credentials grant is always on; the authorization-code + refresh grants are flag-gated OFF in production (oauth_authcode_enabled) — source-verified 2026-10-22.",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers/oauth",
  review_portal_url: "https://bizreviewradar.com/app/developers",
  support_email: null,
  summary:
    "BRR's OAuth 2.0 server: authorization code + PKCE for user-delegated access (flag-gated, currently off) and a separate, always-on client-credentials grant for machine clients. The two client populations are documented separately on purpose.",
  sort_order: 2,
  metadata: {
    auth_method: "OAuth 2.0",
    base_url: "https://bizreviewradar.com",
    endpoints: [
      { label: "Authorization endpoint", url: "https://bizreviewradar.com/api/oauth/authorize", method: "GET" },
      { label: "Token endpoint", url: "https://bizreviewradar.com/api/oauth/token", method: "POST" },
      { label: "Revocation endpoint", url: "https://bizreviewradar.com/api/oauth/revoke", method: "POST", notes: "RFC 7009; flag-gated — 404 while the auth-code flag is off." },
      { label: "Authorization-server metadata", url: "https://bizreviewradar.com/.well-known/oauth-authorization-server", method: "GET" },
      { label: "OAuth documentation", url: "https://bizreviewradar.com/developers/oauth" },
    ],
    scope_profile: "brr_api",
    scopes: [
      "businesses:read",
      "analyses:read",
      "analyses:write",
      "reports:read",
      "recommendations:read",
      "review_replies:write",
      "webhooks:manage",
    ],
    oauth_notes:
      "Grants: (1) authorization_code + PKCE S256 and refresh_token (rotation + reuse detection revokes the family) — both gated by oauth_authcode_enabled, OFF in production; token endpoint returns unsupported_grant_type while off. (2) client_credentials — always on, separate oauth_clients population, documented separately in the OAuth guide; never conflate its credentials with the Muse connector app's. Revocation is RFC 7009 and flag-gated (404 while disabled). Documentation discrepancy: the live /developers/oauth page lists 'replies:write', which does not exist in the code enum — the real scope is review_replies:write.",
    curl_example: CLIENT_CREDENTIALS_CURL_EXAMPLE,
    expected_vault_entries: [
      {
        label: "Client-credentials client ID",
        kind: "oauth_client_id",
        environment: "production",
        placeholder: "ENTER_REAL_CLIENT_ID",
        status: "Not configured",
        note: "For the client_credentials grant ONLY — a separate oauth_clients population in BRR. This is NOT the Muse connector app's client ID.",
      },
      {
        label: "Client-credentials client secret",
        kind: "client_secret",
        environment: "production",
        placeholder: "ENTER_REAL_CLIENT_SECRET",
        status: "Not configured",
        note: "For the client_credentials grant ONLY — separate population from the Muse connector app. Never enter the Muse app's secret here.",
      },
    ] as HubSeedVaultEntry[],
    known_limitations: [
      "Authorization-code and refresh grants are disabled in production until oauth_authcode_enabled is turned on (BRR-side, owner-authorised).",
      "The public OAuth documentation page lists a non-existent 'replies:write' scope — the code enum (review_replies:write) is authoritative.",
    ],
    notes_blockers:
      "Auth-code flow activation depends on the BRR oauth_authcode_enabled flag (off). The Muse connector additionally needs muse_mcp_enabled + MUSE_CONNECTOR_PUBLIC_ORIGIN — see the Muse connector record.",
  },
  documents: [
    { slug: "brr-oauth-guide", title: "BRR OAuth 2.0 — Guide", kind: "doc", body: OAUTH_GUIDE_BODY },
  ],
  checklist_items: [],
  checklist_states: [],
};

// ── Record (d): BRR MCP (generic/private surface) ───────────────────────────

const MCP_NOTES_BODY = [
  "# BRR MCP — Notes (generic / private surface)",
  "",
  `Source: BRR codebase @7e12676b (source audit ${HUB_SEED_DATE}): src/routes/api/public/mcp.ts.`,
  "",
  "## What this surface is",
  "",
  "BRR exposes a general MCP endpoint at https://bizreviewradar.com/api/public/mcp (Streamable HTTP, JSON-RPC 2.0, MCP protocol 2025-06-18 — the initialize response pins protocolVersion 2025-06-18 in source). It is gated by the chatgpt_mcp_enabled flag and serves the FULL tool definitions list.",
  "",
  "## Tools on this surface",
  "",
  "All 9 TOOL_DEFS tools: the 7 Muse-allowlisted tools (documented in full on the Muse connector record — not duplicated here) PLUS the two tools excluded from the Muse connector:",
  "",
  "- brr.get_analysis (analyses:read)",
  "- brr.draft_review_reply (review_replies:write) — generates a review-reply DRAFT only; it never publishes to Google or anywhere else, and a human must approve inside BRR before any publishing.",
  "",
  "## How it differs from the Muse connector",
  "",
  "- The Muse connector surface (/api/public/muse/mcp) is OAuth-only, audience-bound, and filtered by the single MUSE_ALLOWED_TOOL_NAMES allowlist in BOTH tools/list and tools/call.",
  "- The Muse surface's readiness is the three-condition contract (MUSE_CONNECTOR_PUBLIC_ORIGIN + muse_mcp_enabled + oauth_authcode_enabled); this generic surface has its own single flag (chatgpt_mcp_enabled).",
  "- Handshake: standard MCP initialize over Streamable HTTP POST; JSON-RPC 2.0 envelopes; per-tool scope enforcement via the v1 auth pipeline.",
  "",
  "Keep the two surfaces separate in every document and submission: tools or behaviour from this private surface must never be attributed to the Muse connector.",
].join("\n");

const BRR_MCP: HubSeedRecord = {
  slug: "brr-mcp",
  name: "BizReviewRadar MCP (generic surface)",
  vendor: "BizReviewRadar",
  category: "mcp",
  status: "configuring",
  external_status_note:
    "Generic MCP surface exists in source @7e12676b, gated by its own chatgpt_mcp_enabled flag. Distinct from the Muse connector surface — see the Muse connector record for that contract.",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers",
  review_portal_url: null,
  support_email: null,
  summary:
    "BRR's generic/private MCP endpoint (/api/public/mcp): same protocol and transport as the Muse surface but a different flag, a different audience, and the full 9-tool list including the two tools excluded from the Muse connector. Kept as its own record so the surfaces are never conflated.",
  sort_order: 3,
  metadata: {
    auth_method: "OAuth 2.0 / BRR API auth pipeline (per-tool scope enforcement)",
    base_url: "https://bizreviewradar.com",
    endpoints: [
      { label: "Generic MCP endpoint", url: "https://bizreviewradar.com/api/public/mcp", method: "POST", notes: "Gated by the chatgpt_mcp_enabled flag. NOT the Muse connector endpoint." },
      { label: "Muse MCP endpoint (separate surface)", url: "https://bizreviewradar.com/api/public/muse/mcp", method: "POST", notes: "Documented on the BizReviewRadar Muse Connector record." },
    ],
    protocol: {
      mcp_version: "2025-06-18",
      transport: "Streamable HTTP",
      format: "JSON-RPC 2.0",
      handshake:
        "MCP initialize over POST; the source pins protocolVersion 2025-06-18 in the initialize response.",
    },
    known_limitations: [
      "This surface hosts brr.get_analysis and brr.draft_review_reply, which are NOT part of the Muse connector — never attribute them to it.",
      "Availability depends on the chatgpt_mcp_enabled flag in BRR; not verified live from the Hub.",
    ],
    notes_blockers:
      "Cross-reference: the Muse connector's readiness contract and tool inventory live on the BizReviewRadar Muse Connector record. This record intentionally carries no tool inventory to avoid duplication and drift.",
  },
  documents: [
    { slug: "brr-mcp-notes", title: "BRR MCP — Notes (generic / private surface)", kind: "doc", body: MCP_NOTES_BODY },
  ],
  checklist_items: [],
  checklist_states: [],
};

// ── Record (e): BRR Zapier app ──────────────────────────────────────────────

const ZAPIER_INVENTORY: HubSeedTool[] = [
  { name: "analysis_completed", description: "Trigger — Analysis Completed.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "report_generated", description: "Trigger — New Report Generated.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "recommendation_created", description: "Trigger — Recommendation Created.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "list_businesses", description: "Hidden helper — internal dropdown source for business pickers; not a user-facing trigger.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "start_analysis", description: "Action — Start Analysis.", scope: "", permission: "write", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "get_business", description: "Action — Get Business.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "get_competitors", description: "Action — Get Competitors.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "get_recommendations", description: "Action — Get Recommendations.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "generate_review_reply", description: "Action — Generate Review Reply. Draft only: it generates a reply draft and does NOT publish anything to Google; a human approves and publishes inside BRR.", scope: "", permission: "write", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "find_business", description: "Search — Find Business.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
  { name: "find_report", description: "Search — Find Report.", scope: "", permission: "read", input_schema: {}, required: [], test_status: "not_tested", source: "verified_source", source_ref: BRR_SOURCE_REF },
];

const ZAPIER_GUIDE_BODY = [
  "# BRR Zapier App — Guide (corrected inventory)",
  "",
  `Source: the zapier/ app in the BRR repo @7e12676b (source audit ${HUB_SEED_DATE}) — zapier/index.js, zapier/package.json, triggers/, creates/, searches/. This inventory corrects BRR's developer-page copy, which advertises operations the app does not have.`,
  "",
  "## App status",
  "",
  "Private app: zapier/package.json sets \"private\": true. Invite-only; public Zapier submission is paused. BRR's Terms (§10) likewise describe the Zapier integration as private, for controlled demonstration and approved accounts only.",
  "",
  "## Authentication",
  "",
  "A BRR test API key (brr_test_ prefix), verified by the app against GET https://bizreviewradar.com/api/v1/integration-test. (Live keys are refused by the API in the current demo phase — see the REST API record.)",
  "",
  "## Triggers",
  "",
  "- Analysis Completed (analysis_completed)",
  "- New Report Generated (report_generated)",
  "- Recommendation Created (recommendation_created)",
  "- List Businesses (list_businesses) — hidden internal dropdown helper, not a user-facing trigger",
  "",
  "## Actions",
  "",
  "- Start Analysis (start_analysis)",
  "- Get Business (get_business)",
  "- Get Competitors (get_competitors)",
  "- Get Recommendations (get_recommendations)",
  "- Generate Review Reply (generate_review_reply) — DRAFT ONLY. It does not publish to Google; a human reviews and publishes inside BRR.",
  "",
  "## Searches",
  "",
  "- Find Business (find_business)",
  "- Find Report (find_report)",
  "",
  "## Corrections to BRR's developer-page copy",
  "",
  "- There is NO 'Create business' action anywhere in the app — the developer page suggesting one is wrong.",
  "- There is NO 'New analysis' trigger — the trigger is 'Analysis Completed'.",
  "",
  "## Webhook forwarding — documented, but it is NOT a Zapier feature",
  "",
  "Event forwarding to external URLs is BRR's separate webhooks system (see the BRR Webhooks record). It is not a Zapier trigger and must not be inventoried as one.",
].join("\n");

const BRR_ZAPIER: HubSeedRecord = {
  slug: "brr-zapier",
  name: "BizReviewRadar Zapier App",
  vendor: "BizReviewRadar",
  category: "automation",
  status: "configuring",
  external_status_note:
    "Private Zapier app (\"private\": true in zapier/package.json @7e12676b) — invite-only; public submission paused. Inventory below is the corrected one from the app source, not the developer-page copy.",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers",
  review_portal_url: null,
  support_email: null,
  summary:
    "BRR's private Zapier app: 3 user-facing triggers (+1 hidden dropdown helper), 5 actions, 2 searches, authenticated with a brr_test_ API key. The inventory is the source-verified one — BRR's developer page advertises a 'Create business' action and a 'New analysis' trigger that do not exist.",
  sort_order: 4,
  metadata: {
    auth_method: "API key (brr_test_) verified against GET /api/v1/integration-test",
    base_url: "https://bizreviewradar.com",
    app_visibility:
      "Private — invite-only; public Zapier submission paused (\"private\": true in zapier/package.json).",
    endpoints: [
      { label: "Auth check endpoint (used by the app)", url: "https://bizreviewradar.com/api/v1/integration-test", method: "GET" },
      { label: "Developer portal", url: "https://bizreviewradar.com/developers" },
    ],
    tool_inventory: ZAPIER_INVENTORY,
    expected_vault_entries: [
      {
        label: "Zapier API key",
        kind: "api_key",
        environment: "test",
        placeholder: "ENTER_REAL_API_KEY",
        status: "Not configured",
        note: "The brr_test_ API key the Zapier app authenticates with (checked against GET /api/v1/integration-test). Same test key as the REST API record's, entered separately for this app.",
      },
    ] as HubSeedVaultEntry[],
    known_limitations: [
      "No 'Create business' action exists — BRR's developer page copy suggesting one is wrong (source-verified).",
      "No 'New analysis' trigger exists — the trigger is 'Analysis Completed'.",
      "Generate Review Reply is draft-only — it does not publish to Google.",
      "Private app: invite-only; public submission paused.",
      "Webhook forwarding belongs to BRR's separate webhooks system — it is documented on the BRR Webhooks record, not inventoried here as a Zapier trigger.",
    ],
    notes_blockers:
      "The app is private by BRR's own configuration; making it public is a BRR/Zapier-side decision, not a Hub action.",
  },
  documents: [
    { slug: "brr-zapier-guide", title: "BRR Zapier App — Guide (corrected inventory)", kind: "doc", body: ZAPIER_GUIDE_BODY },
  ],
  checklist_items: [],
  checklist_states: [],
};

// ── Record (f): BRR Webhooks ────────────────────────────────────────────────

const WEBHOOK_EVENT_TYPES = [
  "analysis.completed",
  "analysis.failed",
  "report.generated",
  "recommendation.created",
  "webhook.test",
] as const;

const WEBHOOKS_GUIDE_BODY = [
  "# BRR Webhooks — Guide",
  "",
  `Source: BRR codebase @7e12676b (source audit ${HUB_SEED_DATE}): src/lib/webhooks.server.ts.`,
  "",
  "## Signature scheme (sender side, from source)",
  "",
  "- Header: X-BRR-Signature: sha256=<hex>",
  "- Value: HMAC-SHA256, keyed with the endpoint's signing secret, over the string \"{timestampSec}.{body}\" — the Unix-seconds timestamp, a literal dot, then the raw request body.",
  "- Companion headers: X-BRR-Timestamp (same timestamp), X-BRR-Event-Id, X-BRR-Event-Type, X-BRR-Delivery-Id.",
  "",
  "## Event types (the complete sender catalogue)",
  "",
  ...WEBHOOK_EVENT_TYPES.map((e) => `- ${e}`),
  "",
  "## Delivery behaviour (sender side, from source)",
  "",
  "- Retries: delays of 30, 120, 600, 3600, 21600 seconds; MAX_ATTEMPTS = 5, after which the delivery is dead-lettered.",
  "- Redirects are NOT followed: a 3xx response is treated as a failed delivery (redirect_not_allowed in the private demo phase configuration).",
  "- An endpoint is auto-disabled after 20 consecutive failed deliveries (disabled_reason: auto_disabled_consecutive_failures).",
  "- Delivery is at-least-once (BRR Terms §9): events may arrive more than once or out of order — see duplicate handling below.",
  "",
  "## Receiver guidance (receiver-side only — NOT a BRR sender property)",
  "",
  "- Freshness window: receivers should reject deliveries whose X-BRR-Timestamp is more than 300 seconds old. This 300s window is receiver-side guidance only; the BRR sender does not enforce it.",
  "- Verify X-BRR-Signature against the raw body before trusting any payload, using the signing secret stored in the vault.",
  "- Duplicate handling: because delivery is at-least-once, receivers should deduplicate on X-BRR-Event-Id / X-BRR-Delivery-Id and make handlers idempotent.",
  "",
  "## Management",
  "",
  "- Webhooks are managed through the BRR REST API (/api/v1/webhooks, scope webhooks:manage), including a rotate-secret operation; the signing secret is shown once — store it in this record's vault entry immediately.",
].join("\n");

const BRR_WEBHOOKS: HubSeedRecord = {
  slug: "brr-webhooks",
  name: "BizReviewRadar Webhooks",
  vendor: "BizReviewRadar",
  category: "webhooks",
  status: "configuring",
  external_status_note:
    "Webhook mechanics source-verified @7e12676b (webhooks.server.ts). No endpoint or signing secret has been entered into the Hub yet.",
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers",
  review_portal_url: null,
  support_email: null,
  summary:
    "BRR's outbound webhooks: HMAC-SHA256-signed event deliveries (5 event types) with a fixed retry schedule, dead-lettering, and auto-disable after repeated failures. Signing/verification facts are documented from source; the 300s freshness window is labelled receiver guidance, not a sender property.",
  sort_order: 5,
  metadata: {
    auth_method: "HMAC-SHA256 signature (X-BRR-Signature header)",
    base_url: "https://bizreviewradar.com",
    endpoints: [
      { label: "Webhooks API", url: "https://bizreviewradar.com/api/v1/webhooks", notes: "Requires the webhooks:manage scope. Includes test-delivery and rotate-secret operations." },
    ],
    webhook_signing:
      "X-BRR-Signature: sha256=<hex> — HMAC-SHA256 over \"{timestampSec}.{body}\" keyed with the endpoint signing secret. Companion headers: X-BRR-Timestamp, X-BRR-Event-Id, X-BRR-Event-Type, X-BRR-Delivery-Id. Retries at 30/120/600/3600/21600s, MAX_ATTEMPTS=5, then dead letter; 3xx responses count as failures (redirects not followed); endpoint auto-disabled after 20 consecutive failures. The 300s freshness window is RECEIVER-side guidance only, not a sender property; receivers should deduplicate on the event/delivery ids (at-least-once delivery).",
    webhooks: [
      {
        name: "BRR account events",
        events: [...WEBHOOK_EVENT_TYPES],
        notes: "All five sender event types from WEBHOOK_EVENT_TYPES in webhooks.server.ts @7e12676b.",
      },
    ],
    expected_vault_entries: [
      {
        label: "BRR webhook signing secret",
        kind: "webhook_secret",
        environment: "production",
        placeholder: "ENTER_REAL_WEBHOOK_SECRET",
        status: "Not configured",
        note: "The signing secret of the registered BRR webhook endpoint. BRR shows it once at creation/rotation — store it here immediately. Used by receivers to verify X-BRR-Signature.",
      },
    ] as HubSeedVaultEntry[],
    known_limitations: [
      "Delivery is at-least-once: duplicates and out-of-order arrivals are expected; receivers must deduplicate.",
      "Endpoints are auto-disabled after 20 consecutive failed deliveries — monitor delivery health in BRR.",
      "The 300s freshness window is receiver guidance only; BRR's sender does not enforce it.",
    ],
  },
  documents: [
    { slug: "brr-webhooks-guide", title: "BRR Webhooks — Guide", kind: "doc", body: WEBHOOKS_GUIDE_BODY },
  ],
  checklist_items: [],
  checklist_states: [],
};

// ── Templates (Hub-global documents, integration_id NULL) ───────────────────
// Part 8 field skeletons with placeholders. A template is NOT a
// connection: it becomes a real record only when an admin clones it
// into an integration record and completes + tests it.

const templateBody = (title: string, fields: string[]): string =>
  [
    `# Template — ${title}`,
    "",
    "Template — not a connection. Clone this skeleton into a real integration record, replace every placeholder, and test before relying on it. Nothing in a template is a verified fact about any service.",
    "",
    "## Field skeleton",
    "",
    ...fields.map((f) => `- ${f}`),
    "",
    "## Placeholders",
    "",
    "Values are entered by the operator through the Hub UI. Credential values belong ONLY in the vault (Credentials tab) — a template never contains a real credential; form placeholders look like ENTER_REAL_API_KEY and are refused if submitted as values.",
  ].join("\n");

export const HUB_SEED_GLOBAL_DOCUMENTS: HubSeedDocument[] = [
  {
    slug: "template-n8n",
    title: "Template — n8n Integration Record",
    kind: "doc",
    body: templateBody("n8n Integration Record", [
      "Integration name: <name of the workflow/integration>",
      "n8n instance URL: <https://your-n8n.example.com>",
      "Workflow name / ID: <workflow name or id>",
      "Trigger type: <webhook / schedule / app event>",
      "Webhook URL (if any): <https://…>",
      "Connected service: <the external service the workflow talks to>",
      "Auth method: <API key / OAuth 2.0 / header auth>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-make",
    title: "Template — Make Integration Record",
    kind: "doc",
    body: templateBody("Make Integration Record", [
      "Integration name: <name of the scenario/integration>",
      "Make organisation / team: <org or team name>",
      "Scenario name / ID: <scenario name or id>",
      "Trigger module: <module that starts the scenario>",
      "Connected service: <the external service>",
      "Connection type in Make: <API key / OAuth 2.0 / other>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-pabbly",
    title: "Template — Pabbly Integration Record",
    kind: "doc",
    body: templateBody("Pabbly Integration Record", [
      "Integration name: <name of the workflow/integration>",
      "Pabbly workflow name / ID: <workflow name or id>",
      "Trigger app + event: <app — event>",
      "Action app(s): <apps the workflow writes to>",
      "Connected service: <the external service>",
      "Auth method: <API key / OAuth 2.0 / webhook>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-custom-rest-api",
    title: "Template — Custom REST API",
    kind: "doc",
    body: templateBody("Custom REST API", [
      "Service name: <service>",
      "Base URL: <https://api.example.com/v1>",
      "Documentation URL: <https://…>",
      "Auth method: <Bearer API key / OAuth 2.0 / basic / none>",
      "Smoke-test endpoint: <GET https://…>",
      "Example request: curl -sS \"<url>\" -H \"Authorization: Bearer ${API_KEY_PLACEHOLDER}\"",
      "Rate limits: <as documented by the provider>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-custom-mcp-server",
    title: "Template — Custom MCP Server",
    kind: "doc",
    body: templateBody("Custom MCP Server", [
      "Server name: <name>",
      "MCP endpoint: <https://…/mcp>",
      "Transport: <Streamable HTTP / stdio / SSE>",
      "MCP protocol version: <e.g. 2025-06-18>",
      "Auth method: <OAuth 2.0 / API key / none>",
      "Authorization-server metadata URL: <https://…/.well-known/oauth-authorization-server>",
      "Scopes: <comma-separated>",
      "Tool inventory: <name — scope — read/write — description>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-generic-oauth",
    title: "Template — Generic OAuth 2.0",
    kind: "doc",
    body: templateBody("Generic OAuth 2.0", [
      "Provider name: <provider>",
      "Authorization endpoint: <https://…/authorize>",
      "Token endpoint: <https://…/token>",
      "Revocation endpoint: <https://…/revoke or 'not offered'>",
      "Grant types: <authorization_code / client_credentials / refresh_token>",
      "PKCE: <S256 required / supported / not supported>",
      "Client type: <confidential / public>",
      "Redirect URI(s): <https://…>",
      "Scopes: <comma-separated>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-generic-api-key",
    title: "Template — Generic API-Key Integration",
    kind: "doc",
    body: templateBody("Generic API-Key Integration", [
      "Service name: <service>",
      "Base URL: <https://…>",
      "Key format / prefix: <e.g. prefix_…>",
      "Header or parameter carrying the key: <e.g. Authorization: Bearer>",
      "Environments available: <test / production>",
      "Key creation location: <provider dashboard URL>",
      "Credential location: Hub vault entry label (never the value)",
      "Test status: not_tested",
    ]),
  },
  {
    slug: "template-generic-webhooks",
    title: "Template — Generic Webhooks",
    kind: "doc",
    body: templateBody("Generic Webhooks", [
      "Service name: <service>",
      "Signing scheme: <e.g. HMAC-SHA256 over '{timestamp}.{body}'>",
      "Signature header: <header name>",
      "Companion headers: <timestamp / event id / delivery id headers>",
      "Event types: <comma-separated catalogue>",
      "Retry schedule: <delays + max attempts + dead-letter behaviour>",
      "Receiver guidance: <freshness window, deduplication keys>",
      "Credential location: Hub vault entry label for the signing secret (never the value)",
      "Test status: not_tested",
    ]),
  },
];

// ── The seed set ────────────────────────────────────────────────────────────

export const HUB_SEED_RECORDS: HubSeedRecord[] = [
  BRR_MUSE_CONNECTOR,
  BRR_REST_API,
  BRR_OAUTH,
  BRR_MCP,
  BRR_ZAPIER,
  BRR_WEBHOOKS,
];

export function getSeedRecord(slug: string): HubSeedRecord | undefined {
  return HUB_SEED_RECORDS.find((r) => r.slug === slug);
}
