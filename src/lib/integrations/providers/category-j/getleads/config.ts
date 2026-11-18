/**
 * GetLeads config — verified against the official API docs at
 * https://www.getleads.io/docs/ (read 2026-11-19).
 *
 * Auth: API key as `Authorization: Bearer <keyId>_<secret>` or
 * `X-API-Key` header. This adapter uses the Bearer header. Generate a
 * key at app.getleads.io/api-keys. No env var is read by this code:
 * the key is supplied by the caller (stored encrypted in
 * `integration_connections`) or as the adapter option.
 *
 * Verified endpoints (base https://app.getleads.io):
 *  - GET  /api/health (public liveness probe)
 *  - POST /api/v1/contacts/search — filters + columns + limit/offset;
 *    response: { contacts, returned, has_more, next_offset }
 *  - POST /api/v1/contacts/search/count — free; { total_matching }
 *  - POST /api/v1/enrich/from-linkedin — { items: [{ linkedin_url }], limit_per_item }
 *  - POST /api/v1/enrich/from-email — { items: [{ email }], limit_per_item }
 *  - POST /api/v1/enrich/from-person — { items: [{ first_name, last_name, company_name | email_domain }] }
 *    Each enrichment item returns { success, data, ...echoed input }.
 *  - POST /api/v1/companies/search — { companies, returned, has_more, next_offset };
 *    REST rows use storage names (co_name, org_domain,
 *    current_company_linkedin_url, co_website, co_description,
 *    current_company_industry, org_revenue_range, employee_count_range,
 *    company_hq_country, company_hq_city).
 *  - GET  /api/v1/companies/lookup?domain= | ?company_name= — { found, company }
 *  - GET  /api/v1/contacts/lookup/phone?phone= — reverse lookup by phone (1 credit on match)
 *  - GET  /api/v1/usage/fair-use — account fair-use budget (authoritative)
 *
 * Rate limit: 100 requests/minute per account (shared across keys);
 * 429 carries Retry-After. Billing: 1 plan credit per returned record
 * on search/export/enrichment; a genuine no-match enrichment should
 * not consume a record credit. JSON enrichment batches accept up to
 * 100 people; REST contact search serves up to 5,000 rows per page.
 * A stored work email is NOT necessarily verified: only email_status
 * VALID means deliverable — verify before sending.
 */

import type { FieldMapping } from "../../types";
import type { ProviderDefinition } from "../../types";

export const GETLEADS_BASE_URL = "https://app.getleads.io";
export const GETLEADS_DOCS_URL = "https://www.getleads.io/docs/";

/** Columns requested on contact search / enrichment reads. */
export const GETLEADS_CONTACT_COLUMNS = [
  "full_name",
  "first_name",
  "last_name",
  "current_title",
  "work_email",
  "email_status",
  "company_name",
  "company_domain",
  "company_linkedin_url",
  "linkedin_url",
  "direct_dial",
  "mobile_phone",
];

/** Columns requested on company search reads (canonical names). */
export const GETLEADS_COMPANY_COLUMNS = [
  "company_name",
  "company_domain",
  "company_linkedin_url",
  "company_website",
  "company_description",
  "company_industry",
  "revenue_range",
  "employee_count_range",
  "company_hq_country",
  "company_hq_city",
];

export const GETLEADS_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "full_name", target: "full_name", required: false },
  { source: "first_name", target: "first_name", required: false },
  { source: "last_name", target: "last_name", required: false },
  { source: "current_title", target: "job_title", required: false },
  { source: "work_email", target: "email", required: false },
  { source: "email_status", target: "email_status", required: false },
  { source: "company_name", target: "company", required: false },
  { source: "company_domain", target: "company_domain", required: false },
  { source: "linkedin_url", target: "linkedin_url", required: false },
  { source: "direct_dial", target: "phone", required: false },
];

export const GETLEADS_CONFIG = {
  provider: "getleads",
  name: "GetLeads",
  baseUrl: GETLEADS_BASE_URL,
  authType: "api_key" as const,
  docsUrl: GETLEADS_DOCS_URL,
  envVars: { apiKey: "GETLEADS_API_KEY" },
  fieldMappings: GETLEADS_FIELD_MAPPINGS,
  contactColumns: GETLEADS_CONTACT_COLUMNS,
  companyColumns: GETLEADS_COMPANY_COLUMNS,
  twoWaySync: false,
  /** Max people per JSON enrichment batch, per the docs. */
  maxEnrichBatch: 100,
  /** Max rows per REST contact-search page, per the docs. */
  maxSearchPage: 5000,
  capabilities: [
    "Contact search by domain, title, seniority, industry, country and more (POST /api/v1/contacts/search)",
    "Person enrichment from LinkedIn URL, work email, or name + company (POST /api/v1/enrich/from-linkedin|from-email|from-person)",
    "Company search and lookup by domain or name (POST /api/v1/companies/search, GET /api/v1/companies/lookup)",
    "Reverse lookup by phone (GET /api/v1/contacts/lookup/phone)",
    "Fair-use budget read (GET /api/v1/usage/fair-use)",
  ],
  endpointsVerified: true,
} as const;

export const GETLEADS_DEFINITION: ProviderDefinition = {
  id: "getleads",
  name: "GetLeads",
  category: "enrichment",
  authType: "api_key",
  docsUrl: GETLEADS_DOCS_URL,
  capabilities: [
    "Contact search (POST /api/v1/contacts/search, up to 5,000 rows/page) — implemented, NOT live-verified",
    "Person enrichment from LinkedIn URL, work email, or name + company (POST /api/v1/enrich/from-*) — implemented, NOT live-verified",
    "Company search + lookup by domain/name (POST /api/v1/companies/search, GET /api/v1/companies/lookup) — implemented, NOT live-verified",
    "Rate limit 100 requests/min per account; 1 plan credit per returned record; only email_status VALID is deliverable — verify before sending",
    "Auth: API key as Authorization: Bearer <redacted> (or X-API-Key); stored encrypted in integration_connections",
  ],
  twoWaySync: false,
};
