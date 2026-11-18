/**
 * Snov.io enrichment — config.
 *
 * Verified against Snov.io's official API docs and knowledge base
 * (snov.io/api, snov.io/knowledgebase, read 2026-11-19):
 *  - Auth: OAuth 2.0 client credentials — POST
 *    /v1/oauth/access_token {grant_type: "client_credentials",
 *    client_id, client_secret} → {access_token, expires_in: 3600}.
 *    Send as `Authorization: Bearer <token>`.
 *  - v2 methods are ASYNC: POST .../start → {task_hash}, then
 *    GET .../result/{task_hash} (or ?task_hash=) until done.
 *  - POST /v2/domain-search/start {domain} → company info; GET
 *    /v2/domain-search/result/{task_hash}.
 *  - POST /v2/domain-search/prospects/start?domain= → prospects;
 *    POST /v2/domain-search/prospects/search-emails/start/{hash}.
 *  - POST /v2/emails-by-domain-by-name/start {names: [{first_name,
 *    last_name}], domain} — up to 10 prospects per call.
 *  - POST /v2/company-domain-by-name/start {company_name}.
 *  - POST /v2/email-verification/start {emails: [...]} — verifier
 *    (used by the enrichment flow only to attach a status; the
 *    dedicated verification surface is NOT built here).
 *  - POST /v2/li-profiles-by-urls/start {urls: [...]} — LinkedIn
 *    profile enrichment.
 *  - Credit model: 1 credit per POST start (domain search); 1 per
 *    prospect profile with an email; email verification 1 per valid
 *    or invalid result, 0 for unknown. Credits only for successful
 *    requests. Rate limit 60 calls/min.
 */

export const SNOV_CONFIG = {
  provider: "snov",
  name: "Snov.io",
  baseUrl: "https://api.snov.io",
  docsUrl: "https://snov.io/api",
  authType: "oauth2" as const,
  envVars: { clientId: "SNOV_CLIENT_ID", clientSecret: "SNOV_CLIENT_SECRET" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "location",
    "company_domain",
    "email_verification_status",
  ],
  capabilities: [
    "Domain Search: company info + emails for a domain (async, POST /v2/domain-search/start)",
    "Email Finder: email for up to 10 named prospects at a domain (POST /v2/emails-by-domain-by-name/start)",
    "Company domain from company name (POST /v2/company-domain-by-name/start)",
    "LinkedIn profile enrichment by URL (POST /v2/li-profiles-by-urls/start)",
    "Email verification status attach (POST /v2/email-verification/start)",
  ],
  endpointsVerified: true,
  tokenTtlSeconds: 3600,
  pollIntervalMs: 5000,
  maxPollAttempts: 12,
} as const;
