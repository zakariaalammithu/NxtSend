/**
 * Hunter Email Verifier — config.
 *
 * Verified against Hunter's official API Reference V2
 * (hunter.io/api-documentation, read 2026-11-19):
 *  - Base URL `https://api.hunter.io/v2`.
 *  - Auth: API key as the `api_key` query parameter, the
 *    `X-API-KEY` header, or `Authorization: Bearer`. This adapter
 *    uses the `X-API-KEY` header so the key never lands in a URL.
 *  - GET /email-verifier?email= — deliverability check: syntax,
 *    MX records, SMTP handshake (no email is sent). `data.status`
 *    is one of: deliverable, undeliverable, risky, unknown
 *    (verbatim); `data.result` carries the same vocabulary.
 *    Also returned: data.score, data.regexp, data.gibberish,
 *    data.disposable, data.webmail, data.mx_records, data.smtp_server,
 *    data.smtp_check, data.accept_all, data.block, data.sources.
 *  - GET /account — searches / verifications used and remaining.
 *  - This is the VERIFICATION adapter. Hunter's enrichment
 *    endpoints (email-finder, domain-search, people/company find)
 *    live in the separate `hunter` enrichment adapter; the two
 *    share the same HUNTER_API_KEY.
 *  - Rate limits: Email Verifier 10 req/sec, 300 req/min.
 */

export const HUNTER_VERIFIER_CONFIG = {
  provider: "hunter-verifier",
  name: "Hunter Email Verifier",
  baseUrl: "https://api.hunter.io/v2",
  docsUrl: "https://hunter.io/api-documentation",
  authType: "api_key" as const,
  envVars: { apiKey: "HUNTER_API_KEY" },
  classifications: ["deliverable", "undeliverable", "risky", "unknown"],
  capabilities: [
    "Single email verification (GET /email-verifier)",
    "Account usage: verifications remaining (GET /account)",
    "Bulk verification runs as sequential single checks through sync jobs",
    "Classifications preserved verbatim: deliverable, undeliverable, risky, unknown",
  ],
  endpointsVerified: true,
} as const;
