/**
 * Bouncer email verification — config.
 *
 * Verified against Bouncer's API v1.1 documentation as cited by
 * the Tomba migration guide (checked 2026-09-29 against Bouncer's
 * docs) and Bouncer's own guides (usebouncer.com, read 2026-11-19):
 *  - Base URL `https://api.usebouncer.com`.
 *  - Auth: API key in the `x-api-key` header (or HTTP Basic auth).
 *  - GET /v1.1/email/verify?email= — real-time verification.
 *    `status` is one of: deliverable, risky, undeliverable,
 *    unknown (verbatim); the response also carries `reason`,
 *    domain/toxicity flags, and a score.
 *  - POST /v1.1/email/verify/batch — batch verification (submit a
 *    list; result retrieval path not confirmed in this pass, so
 *    bulk runs as sequential single checks through sync jobs).
 *  - GET /v1.1/credits — remaining credit balance.
 *  - Credit model: 1 credit per verification; HTTP 402 when the
 *    balance is exhausted.
 */

export const BOUNCER_CONFIG = {
  provider: "bouncer",
  name: "Bouncer",
  baseUrl: "https://api.usebouncer.com",
  docsUrl: "https://www.usebouncer.com/api-documentation/",
  authType: "api_key" as const,
  envVars: { apiKey: "BOUNCER_API_KEY" },
  classifications: ["deliverable", "risky", "undeliverable", "unknown"],
  capabilities: [
    "Single real-time email verification (GET /v1.1/email/verify)",
    "Credit balance (GET /v1.1/credits)",
    "Native batch endpoint POST /v1.1/email/verify/batch exists; its result-retrieval path is unverified, so bulk runs as sequential single checks",
    "Classifications preserved verbatim: deliverable, risky, undeliverable, unknown",
  ],
  endpointsVerified: true,
  batchResultPathVerified: false,
} as const;
