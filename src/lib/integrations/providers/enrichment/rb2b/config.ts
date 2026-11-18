/**
 * RB2B enrichment — config.
 *
 * STATUS: WEBHOOK-ONLY, no pull API. Verified against RB2B's public
 * material (reply.io's RB2B API review citing RB2B's docs, and
 * RB2B's own help center, read 2026-11-19):
 *  - RB2B identifies people visiting YOUR website (person-level,
 *    US traffic only) and pushes each identification to you via a
 *    webhook in real time. There is NO endpoint to query identified
 *    visitors (no GET /visitors, no date-range search, no pull of
 *    yesterday's identifications).
 *  - The only documented public API is the OEM partner API (add /
 *    remove / list tracked domains, check credit usage) for companies
 *    embedding RB2B into their own platform — not a customer query
 *    API. Enrolling in the OEM program deactivates a consumer RB2B
 *    account.
 *  - The webhook payload carries: email, first name, last name,
 *    job title, company name, LinkedIn URL, city/state, industry,
 *    revenue, employee count, pages visited, tags.
 *  - RB2B does NOT support HMAC signature verification on outgoing
 *    webhooks; its own recommended workaround is to treat the
 *    destination URL as a shared secret.
 *  - US-only: RB2B does not resolve EU/UK traffic (GDPR).
 *
 * The adapter therefore makes NO HTTP calls. It maps an incoming
 * RB2B webhook payload onto an EnrichmentResult + lead patch — the
 * shape a webhook receiver route would use. Domain management via
 * the OEM API is out of scope (partner program only).
 */

export const RB2B_CONFIG = {
  provider: "rb2b",
  name: "RB2B",
  baseUrl: null,
  docsUrl: "https://support.rb2b.com/",
  authType: "webhook" as const,
  envVars: { webhookSecret: "RB2B_WEBHOOK_SECRET" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "location",
    "industry",
    "company_size",
    "pages_visited",
  ],
  capabilities: [
    "Webhook ingestion of identified website visitors (person-level, US traffic only)",
    "No pull/query API exists — data arrives only via RB2B's outbound webhook",
    "OEM partner API (domain management + credit usage) is partner-only and out of scope",
    "No HMAC verification on RB2B webhooks — destination URL must be treated as a shared secret",
  ],
  endpointsVerified: false,
  status: "webhook_only",
} as const;
