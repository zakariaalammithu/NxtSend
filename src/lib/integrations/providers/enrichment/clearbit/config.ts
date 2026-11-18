/**
 * Clearbit / HubSpot Data Enrichment — config.
 *
 * STATUS: PROVIDER BLOCKED. HubSpot acquired Clearbit (completed
 * 4 December 2023) and moved the enrichment technology into
 * HubSpot as Breeze Intelligence / "data enrichment". The standalone
 * Clearbit API is deprecated and no longer sold to new customers;
 * the free tools (Clearbit Platform, Connect, Logo API) were shut
 * down between April and December 2025. Enrichment now runs only
 * inside a paid HubSpot subscription, on records inside HubSpot —
 * there is no standalone enrichment endpoint to call from NxtSend.
 *
 * Legacy endpoints (HISTORICAL ONLY — do not call for new
 * accounts):
 *  - GET https://person.clearbit.com/v2/combined/find?email=
 *  - GET https://company.clearbit.com/v2/companies/find?domain=
 *    (both with `Authorization: Bearer <key>`)
 *
 * The adapter below therefore refuses every operation with
 * `provider_unavailable` and explains the situation. If NxtSend
 * later adds a HubSpot CRM integration, that is where Clearbit
 * data would surface — not through this adapter.
 */

export const CLEARBIT_CONFIG = {
  provider: "clearbit",
  name: "Clearbit / HubSpot Data Enrichment",
  baseUrl: null,
  docsUrl: null,
  authType: "api_key" as const,
  envVars: { apiKey: "CLEARBIT_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "location",
    "seniority",
    "industry",
    "company_size",
  ],
  capabilities: [
    "BLOCKED: standalone Clearbit API deprecated after the HubSpot acquisition (Dec 2023)",
    "Enrichment now only inside HubSpot (Breeze Intelligence / data enrichment) on HubSpot records — no standalone API",
    "Legacy endpoints person.clearbit.com / company.clearbit.com are historical only",
  ],
  endpointsVerified: false,
  status: "blocked",
  blockedReason:
    "HubSpot acquired Clearbit in Dec 2023; the standalone API is deprecated, no longer sold to new customers, and enrichment is only available inside a paid HubSpot subscription.",
} as const;
