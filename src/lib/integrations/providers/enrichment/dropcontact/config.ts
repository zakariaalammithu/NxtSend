/**
 * Dropcontact enrichment — config.
 *
 * Verified against Dropcontact's official docs
 * (developer.dropcontact.com, read 2026-11-19):
 *  - Base URL `https://api.dropcontact.com/v1`.
 *  - Auth: API key in the `X-Access-Token` header.
 *  - ONE async endpoint: POST /v1/enrich/all with {data: [contacts]}
 *    (up to 250 contacts, 15 KB each) → {request_id, credits_left}.
 *    Then GET /v1/enrich/all/{request_id} → {success, data: [...]}
 *    or {success: false, reason: "Request not ready yet, try again
 *    in 30 seconds"}.
 *  - Returned fields: civility, names, qualified emails (with
 *    `qualification`, e.g. "nominative@pro"), phone, company,
 *    website, LinkedIn, SIREN/SIRET/VAT/NAF for French companies,
 *    industry and headcount on trial/Growth.
 *  - Credit model: charged only on success — a credit is spent when
 *    a verified email is returned (or an email you supplied is
 *    verified). Checking the balance is free; the response carries
 *    `credits_left` on every call.
 *  - Rate limit: 60 requests/second.
 */

export const DROPCONTACT_CONFIG = {
  provider: "dropcontact",
  name: "Dropcontact",
  baseUrl: "https://api.dropcontact.com/v1",
  docsUrl: "https://developer.dropcontact.com/",
  authType: "api_key" as const,
  envVars: { apiKey: "DROPCONTACT_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "company_domain",
    "industry",
    "company_size",
    "email_qualification",
    "siren",
    "siret",
    "vat",
  ],
  capabilities: [
    "Async batch enrichment, up to 250 contacts per call (POST /v1/enrich/all)",
    "Result polling by request_id (GET /v1/enrich/all/{request_id})",
    "Qualified emails with qualification labels (nominative@pro, generic, catch-all, …)",
    "French company identifiers (SIREN / SIRET / VAT / NAF)",
    "Credits left reported on every response — no separate balance endpoint needed",
  ],
  endpointsVerified: true,
  batchSize: 250,
  pollIntervalMs: 30_000,
  maxPollAttempts: 20,
} as const;
