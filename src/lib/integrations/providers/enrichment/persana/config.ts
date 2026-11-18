/**
 * Persana AI enrichment — config.
 *
 * STATUS: CONFIG-READY ONLY. Persana markets a "Full Contact API"
 * (person/company search, waterfall email lookup, phone lookup) on
 * persana.ai/full-contact-api, but no public API reference with a
 * base URL, auth method, or endpoint paths could be found in this
 * pass (checked 2026-11-19). The adapter therefore refuses to call
 * any endpoint: guessing Persana's URLs would violate the
 * no-invented-endpoints rule. When Persana publishes (or the
 * operator supplies) the reference, fill in `baseUrl` and the
 * endpoint paths here and implement the adapter.
 */

export const PERSANA_CONFIG = {
  provider: "persana",
  name: "Persana AI",
  baseUrl: null,
  docsUrl: "https://persana.ai/full-contact-api",
  authType: "api_key" as const,
  envVars: { apiKey: "PERSANA_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "industry",
    "company_size",
  ],
  capabilities: [
    "Person Profile Search (marketed — endpoint unverified)",
    "Company Profile Search by domain / LinkedIn URL (marketed — endpoint unverified)",
    "Waterfall Email Lookup (marketed — endpoint unverified)",
    "Phone Number Lookup (marketed — endpoint unverified)",
  ],
  endpointsVerified: false,
  status: "config_ready",
} as const;
