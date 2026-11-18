/**
 * Factors.ai enrichment — config.
 *
 * STATUS: CONFIG-READY ONLY. Factors.ai (website visitor
 * identification / de-anonymization with waterfall enrichment)
 * lists a "Factors API" article in its help center
 * (help.factors.ai), but the endpoint paths, base URL, and auth
 * method could not be verified from public documentation in this
 * pass (checked 2026-11-19). The adapter therefore refuses to call
 * any endpoint: guessing Factors.ai's URLs would violate the
 * no-invented-endpoints rule. When the API reference is supplied,
 * fill in `baseUrl` and the endpoint paths here and implement the
 * adapter.
 *
 * NOTE: do not confuse Factors.ai (factors.ai, B2B visitor
 * identification) with Factori.ai (factori.ai, an identity/fraud
 * data API at api.factori.ai) — they are different companies with
 * different APIs.
 */

export const FACTORS_CONFIG = {
  provider: "factors",
  name: "Factors.ai",
  baseUrl: null,
  docsUrl: "https://help.factors.ai/en/",
  authType: "api_key" as const,
  envVars: { apiKey: "FACTORS_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "company_domain",
    "industry",
    "company_size",
  ],
  capabilities: [
    "Website visitor identification (company-level, waterfall enrichment) — endpoint unverified",
    "Optional person-level identification via RB2B integration — endpoint unverified",
    "Account timelines / segments / alerts — endpoint unverified",
  ],
  endpointsVerified: false,
  status: "config_ready",
} as const;
