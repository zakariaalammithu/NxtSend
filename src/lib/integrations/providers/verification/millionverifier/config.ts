/**
 * MillionVerifier email verification — config.
 *
 * Verified against MillionVerifier's official docs
 * (developer.millionverifier.com, help.millionverifier.com, read
 * 2026-11-19):
 *  - Base URL `https://api.millionverifier.com`.
 *  - Auth: API key as the `api` query parameter on the single and
 *    credits endpoints (the bulk API uses `key` instead — a
 *    different host, bulkapi.millionverifier.com, and a file-based
 *    flow, which this adapter does not use).
 *  - GET /api/v3/?api=<key>&email=<email>&timeout=<2..60> — single
 *    real-time verification. `result` is one of: ok, catch_all,
 *    unknown, error, disposable, invalid (verbatim). Also returned:
 *    resultcode, subresult, quality, free, role, didyoumean,
 *    credits.
 *  - GET /api/v3/credits?api=<key> — remaining credit balance.
 *  - IMPORTANT: auth failures return HTTP 200 with result "error" —
 *    the adapter checks for that explicitly.
 *  - Credit model: prepaid packs, 1 credit per verification,
 *    credits never expire; HTTP 402 when the balance hits zero.
 *    Verifying the same address twice charges twice.
 *  - Rate limit: 160 requests/second (single API).
 */

export const MILLIONVERIFIER_CONFIG = {
  provider: "millionverifier",
  name: "MillionVerifier",
  baseUrl: "https://api.millionverifier.com",
  docsUrl: "https://developer.millionverifier.com",
  authType: "api_key" as const,
  envVars: { apiKey: "MILLIONVERIFIER_API_KEY" },
  classifications: ["ok", "catch_all", "unknown", "error", "disposable", "invalid"],
  capabilities: [
    "Single real-time email verification (GET /api/v3/?api=&email=&timeout=)",
    "Credit balance (GET /api/v3/credits?api=)",
    "Bulk verification runs as sequential single checks through sync jobs (file-based bulk API on bulkapi.millionverifier.com is not used)",
    "Classifications preserved verbatim: ok, catch_all, unknown, error, disposable, invalid",
  ],
  endpointsVerified: true,
  defaultTimeoutSeconds: 20,
} as const;
