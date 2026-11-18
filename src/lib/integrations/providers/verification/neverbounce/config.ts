/**
 * NeverBounce email verification — config.
 *
 * Verified against NeverBounce's official API v4 docs
 * (developers.neverbounce.com, read 2026-11-19):
 *  - Base URL `https://api.neverbounce.com/v4`.
 *  - Auth: API key (`secret_...`, created in the NeverBounce app)
 *    as the `key` query parameter. V3 credentials (username +
 *    secret key) do NOT work with v4.
 *  - POST /v4/single/check?key=<key>&email=<email> — single
 *    verification. `result` is one of: valid, invalid, disposable,
 *    catchall, unknown (verbatim). Also returned: flags (hashed
 *    email, role, free, disposable, etc.), suggested_correction,
 *    address_info, credits_info.
 *  - GET /v4/account/info?key=<key> — account + credits info.
 *  - Bulk jobs API: POST /v4/jobs/create, GET /v4/jobs/status,
 *    GET /v4/jobs/parse, GET /v4/jobs/search, POST /v4/jobs/delete.
 *    The jobs API takes form-encoded input, which the Stage-1
 *    ProviderHttpClient does not send (JSON only), so bulk runs as
 *    sequential single checks through sync jobs instead.
 *  - NeverBounce's own guidance: do NOT use single verification to
 *    clean an existing list one-by-one (account-lock risk) — use
 *    the jobs API for list cleaning. This adapter's bulk path is
 *    therefore marked for modest volumes; large list cleaning
 *    should wait for form-encoded jobs support.
 */

export const NEVERBOUNCE_CONFIG = {
  provider: "neverbounce",
  name: "NeverBounce",
  baseUrl: "https://api.neverbounce.com/v4",
  docsUrl: "https://developers.neverbounce.com/v4.0/",
  authType: "api_key" as const,
  envVars: { apiKey: "NEVERBOUNCE_API_KEY" },
  classifications: ["valid", "invalid", "disposable", "catchall", "unknown"],
  capabilities: [
    "Single email verification (POST /v4/single/check)",
    "Account + credits info (GET /v4/account/info)",
    "Bulk verification runs as sequential single checks through sync jobs (jobs API needs form-encoded input, not supported by the Stage-1 HTTP client)",
    "Classifications preserved verbatim: valid, invalid, disposable, catchall, unknown",
  ],
  endpointsVerified: true,
  jobsApiFormEncoded: true,
} as const;
