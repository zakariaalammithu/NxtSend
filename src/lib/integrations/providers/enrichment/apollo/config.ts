/**
 * Apollo.io enrichment — config.
 *
 * Verified against Apollo's official docs (docs.apollo.io, read
 * 2026-11-19):
 *  - Base URL `https://api.apollo.io/api/v1`, auth via the
 *    `x-api-key` header (NOT `Authorization: Bearer`).
 *  - POST /people/match — enrich one person (by email, name +
 *    employer, or LinkedIn URL). Reveal flags add personal emails /
 *    phone numbers.
 *  - POST /people/bulk_match — enrich up to 10 people per call.
 *  - POST /mixed_people/api_search — people search (no credits).
 *  - POST /organizations/enrich — enrich one company by domain.
 *  - Credit model (per Apollo docs): 1 credit for demographics or
 *    email, +8 if a mobile phone is returned; 0 when no
 *    credit-consuming data is found.
 *  - Apollo returns no per-field confidence score, so confidence is
 *    null on every field (never invented).
 */

export const APOLLO_CONFIG = {
  provider: "apollo",
  name: "Apollo.io",
  baseUrl: "https://api.apollo.io/api/v1",
  docsUrl: "https://docs.apollo.io/",
  authType: "api_key" as const,
  envVars: { apiKey: "APOLLO_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "seniority",
    "department",
    "industry",
    "company_size",
    "company_domain",
  ],
  capabilities: [
    "Enrich one person by email, name + employer, or LinkedIn URL (POST /people/match)",
    "Bulk enrichment, up to 10 people per call (POST /people/bulk_match)",
    "People search without spending credits (POST /mixed_people/api_search)",
    "Company enrichment by domain (POST /organizations/enrich)",
    "Waterfall email + phone reveal via reveal_personal_emails / reveal_phone_number",
  ],
  endpointsVerified: true,
  bulkBatchSize: 10,
} as const;
