/**
 * Weezly enrichment — config.
 *
 * STATUS: NOT IMPLEMENTED — no public API found. Weezly is a sales
 * platform (built-in database of 300M+ B2B contacts with emails
 * verified at search time; LinkedIn + email outreach sequences;
 * AI video personalization; unified inbox; deal pipeline). No
 * public developer API or API reference could be found in this
 * pass (checked 2026-11-19): no base URL, no auth method, no
 * endpoint paths. The adapter therefore refuses to call any
 * endpoint. If Weezly publishes a developer API, fill in `baseUrl`
 * and the endpoint paths here and implement the adapter.
 */

export const WEEZLY_CONFIG = {
  provider: "weezly",
  name: "Weezly",
  baseUrl: null,
  docsUrl: "https://weezly.com/",
  authType: "api_key" as const,
  envVars: { apiKey: "WEEZLY_API_KEY" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
  ],
  capabilities: [
    "NOT IMPLEMENTED: no public Weezly developer API or API reference could be found",
    "Weezly's contact database and outreach live inside its own app, not behind a documented REST API",
  ],
  endpointsVerified: false,
  status: "not_implemented",
} as const;
