/**
 * Hunter.io enrichment — config.
 *
 * Verified against Hunter's official API Reference V2
 * (hunter.io/api-documentation, read 2026-11-19):
 *  - Base URL `https://api.hunter.io/v2`.
 *  - Auth: API key as the `api_key` query parameter, the
 *    `X-API-KEY` header, or `Authorization: Bearer`. This adapter
 *    uses the `X-API-KEY` header so the key never lands in a URL.
 *  - GET /domain-search?domain= — all emails for a domain, with
 *    confidence scores and sources.
 *  - GET /email-finder?domain=&first_name=&last_name= — most likely
 *    email for a named person (1 credit; returns a 0–100 confidence).
 *  - GET /people/find?email=|linkedin_handle= — person enrichment.
 *  - GET /companies/find?domain= — company enrichment.
 *  - GET /combined/find?email= — person + company in one call.
 *  - GET /account — searches / verifications used and remaining.
 *  - Hunter's email-verification endpoint lives in the separate
 *    `hunter-verifier` adapter (verification partition), not here.
 */

export const HUNTER_CONFIG = {
  provider: "hunter",
  name: "Hunter.io",
  baseUrl: "https://api.hunter.io/v2",
  docsUrl: "https://hunter.io/api-documentation",
  authType: "api_key" as const,
  envVars: { apiKey: "HUNTER_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "location",
    "seniority",
    "department",
    "industry",
    "company_size",
    "company_domain",
    "email_confidence",
    "email_sources",
  ],
  capabilities: [
    "Email Finder: most likely email for a named person at a domain (GET /email-finder)",
    "Domain Search: all indexed emails for a domain, with confidence + sources (GET /domain-search)",
    "Person enrichment by email or LinkedIn handle (GET /people/find)",
    "Company enrichment by domain (GET /companies/find)",
    "Combined person + company enrichment by email (GET /combined/find)",
    "Account usage: searches / verifications remaining (GET /account)",
  ],
  endpointsVerified: true,
} as const;
