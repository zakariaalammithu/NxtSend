/**
 * ZeroBounce email verification — config.
 *
 * Verified against ZeroBounce's official API v2 docs
 * (zerobounce.net/docs, read 2026-11-19):
 *  - Base URL `https://api.zerobounce.net/v2/` (regional hosts
 *    api-us.zerobounce.net and api-eu.zerobounce.net exist).
 *  - Auth: API key as the `api_key` query parameter.
 *  - GET /v2/validate?api_key=&email=&ip_address= — single
 *    validation. `status` is one of: valid, invalid, catch-all,
 *    unknown, spamtrap, abuse, do_not_mail (verbatim, lowercase as
 *    returned); `sub_status` gives the detail.
 *  - POST /v2/validatebatch {api_key, email_batch: [{email_address,
 *    ip_address}]} — batch validation (up to 100 per call).
 *  - GET /v2/getcredits?api_key= — remaining credit balance.
 *  - Credit model: 1 credit per validation; unknown results are
 *    never charged. Bulk file validation lives on
 *    bulkapi.zerobounce.net and is not used here.
 */

export const ZEROBOUNCE_CONFIG = {
  provider: "zerobounce",
  name: "ZeroBounce",
  baseUrl: "https://api.zerobounce.net/v2",
  docsUrl: "https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails",
  authType: "api_key" as const,
  envVars: { apiKey: "ZEROBOUNCE_API_KEY" },
  classifications: ["valid", "invalid", "catch-all", "unknown", "spamtrap", "abuse", "do_not_mail"],
  capabilities: [
    "Single email validation (GET /v2/validate)",
    "Batch validation, up to 100 per call (POST /v2/validatebatch)",
    "Credit balance (GET /v2/getcredits)",
    "Classifications preserved verbatim: valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail",
  ],
  endpointsVerified: true,
  batchSize: 100,
} as const;
