/**
 * Cornersight config — verified against the official API docs at
 * https://app.cornersight.io/docs and the published OpenAPI spec at
 * https://app.cornersight.io/openapi.json (read 2026-11-19).
 *
 * Cornersight turns LinkedIn post engagement (likes/comments) into
 * enriched leads matched against your ICP. It does NOT sell or
 * supply work emails: emails come from the user's own email-finder
 * connection (LeadMagic, Prospeo, Findymail, Icypeas). Leads it
 * returns therefore carry a LinkedIn URL, job title, company and
 * country — but no email address. Do not treat a missing email as a
 * failed enrichment.
 *
 * Auth: API key (`cs_` prefix, generated in Cornersight → Settings →
 * API key) sent as the `X-API-Key` header on every request. The team
 * needs an active subscription or unexpired trial, otherwise 403.
 * No env var is read by this code.
 *
 * Verified endpoints (base https://app.cornersight.io):
 *  - GET  /api/v1/leads — enriched leads, one row per engagement
 *    (limit 1–100, default 50; offset; profileId/username,
 *    engagementType, isIcp, webhookStatus, name/jobTitle/company/
 *    companyDomain/companyIndustry/country substring filters,
 *    since/until). Response: { data, total, limit, offset, hasMore }.
 *    Lead row: id, profileId, name, linkedinUsername, linkedinUrl,
 *    avatarUrl, jobTitle, company, companyDomain, country,
 *    engagementType (Like|Comment|Author), commentText,
 *    commentPostedAt, isIcp, webhookStatus, postUrl, postPostedAt,
 *    detectedAt, createdAt + company fields companyName, companyUrl,
 *    companyLinkedinUrl, companyDescription, companyIndustry,
 *    companyLocation, companyEmployeeCount, companyStaffRange,
 *    companyEnrichedAt.
 *  - GET  /api/v1/engagers — one row per PERSON (engagementCount,
 *    minEngagements, orderBy engagementCount|lastEngagedAt).
 *  - GET  /api/v1/leads/raw — raw (never enriched) leads only.
 *  - GET  /api/v1/sources — tracked sources (incl. creditCapPerSync).
 *  - POST /api/v1/enrich/profile — async job { jobId }; body
 *    { username, saveTrackedProfile }. saveTrackedProfile=false
 *    fails (404) for anyone not already a lead on a tracked source.
 *  - POST /api/v1/enrich/company — same, for a company page.
 *  - GET  /api/v1/jobs/{jobId}/status — poll until completed/failed.
 *  - GET  /api/v1/credits — balance, used, limit, remaining, plan.
 *
 * Rate limits (per team): reads 120/min, writes 60/min; 429 with
 * Retry-After. Billing: 1 credit per newly enriched person per
 * source; repeat engagements free; failed/empty enrichment free.
 * Cornersight is a lead SOURCE (read-only for NxtSend): it pushes
 * leads out to HeyReach/PlusVibe/webhooks itself. There is no
 * "write a lead into Cornersight" operation, so this adapter has no
 * export — exportLead throws an explicit unsupported-operation error.
 */

import type { FieldMapping } from "../../types";
import type { ProviderDefinition } from "../../types";

export const CORNERSIGHT_BASE_URL = "https://app.cornersight.io";
export const CORNERSIGHT_DOCS_URL = "https://app.cornersight.io/docs";

export const CORNERSIGHT_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "name", target: "full_name", required: false },
  { source: "linkedinUrl", target: "linkedin_url", required: true },
  { source: "jobTitle", target: "job_title", required: false },
  { source: "company", target: "company", required: false },
  { source: "companyDomain", target: "company_domain", required: false },
  { source: "country", target: "country", required: false },
  { source: "isIcp", target: "icp_match", required: false },
  { source: "engagementType", target: "engagement_type", required: false },
  { source: "postUrl", target: "source_post_url", required: false },
  { source: "commentText", target: "source_comment", required: false },
];

export const CORNERSIGHT_CONFIG = {
  provider: "cornersight",
  name: "Cornersight",
  baseUrl: CORNERSIGHT_BASE_URL,
  authType: "api_key" as const,
  docsUrl: CORNERSIGHT_DOCS_URL,
  envVars: { apiKey: "CORNERSIGHT_API_KEY" },
  fieldMappings: CORNERSIGHT_FIELD_MAPPINGS,
  twoWaySync: false,
  /** Max page size on GET /api/v1/leads and /engagers. */
  maxPageSize: 100,
  capabilities: [
    "List enriched LinkedIn-engagement leads (GET /api/v1/leads, one row per engagement)",
    "List engagers aggregated one row per person (GET /api/v1/engagers)",
    "List raw (never enriched) leads (GET /api/v1/leads/raw)",
    "Enrich one profile / company on demand (POST /api/v1/enrich/profile|company, async job + poll)",
    "Credit balance read (GET /api/v1/credits)",
    "No export: Cornersight is a read-only lead source for NxtSend (it pushes to HeyReach/PlusVibe/webhooks itself)",
  ],
  endpointsVerified: true,
} as const;

export const CORNERSIGHT_DEFINITION: ProviderDefinition = {
  id: "cornersight",
  name: "Cornersight",
  category: "enrichment",
  authType: "api_key",
  docsUrl: CORNERSIGHT_DOCS_URL,
  capabilities: [
    "LinkedIn-engagement leads: list enriched leads (GET /api/v1/leads) and per-person engagers (GET /api/v1/engagers) — implemented, NOT live-verified",
    "On-demand profile/company enrichment via async job (POST /api/v1/enrich/profile|company + GET /api/v1/jobs/{jobId}/status) — implemented, NOT live-verified",
    "Leads carry LinkedIn URL, job title, company and country but NO email — Cornersight does not sell emails; use your own email finder",
    "Rate limits 120 reads/min, 60 writes/min per team; 1 credit per newly enriched person per source",
    "Auth: API key (cs_ prefix) as X-API-Key header; stored encrypted in integration_connections",
    "Export NOT supported: Cornersight is a read-only lead source (it pushes to HeyReach/PlusVibe/webhooks itself)",
  ],
  twoWaySync: false,
};
