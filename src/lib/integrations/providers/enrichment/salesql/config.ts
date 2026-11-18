/**
 * SalesQL enrichment — config.
 *
 * Verified against SalesQL's official pages (salesql.com/api and
 * help.salesql.com, read 2026-11-19):
 *  - Base URL `https://api-public.salesql.com/v1`.
 *  - Auth: API key as `Authorization: Bearer <key>`.
 *  - GET /persons/enrich?linkedin_url=|email=|first_name=&last_name=&company=
 *    — verified emails with status, phones, title, location.
 *  - A bulk route POST /enrich/bulk (up to 100) is mentioned on the
 *    API page, but its request schema is NOT published there, so
 *    this adapter does bulk as sequential single calls through sync
 *    jobs instead of guessing the bulk body.
 *  - Company enrichment (industry, size, location, LinkedIn) is a
 *    documented capability, but the exact organisations endpoint
 *    path is not published on the pages checked — enrichCompany is
 *    config-ready only (see adapter).
 *  - Credit model: 1 credit per matched person; company enrichment
 *    and unmatched lookups are free. API access needs the
 *    Professional or Premium plan.
 */

export const SALESQL_CONFIG = {
  provider: "salesql",
  name: "SalesQL",
  baseUrl: "https://api-public.salesql.com/v1",
  docsUrl: "https://salesql.com/api",
  authType: "api_key" as const,
  envVars: { apiKey: "SALESQL_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "email_status",
  ],
  capabilities: [
    "Person enrichment by LinkedIn URL, email, or name + company (GET /persons/enrich)",
    "Verified emails with status (mail_status) and phone validity (is_valid)",
    "Company enrichment (industry, size, location, LinkedIn) — endpoint path unverified, config-ready only",
    "Bulk route POST /enrich/bulk exists per the API page but its request schema is unverified — bulk runs as sequential single calls",
  ],
  endpointsVerified: true,
  companyEndpointVerified: false,
  bulkEndpointVerified: false,
} as const;
