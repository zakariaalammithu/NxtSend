/**
 * Apify enrichment — config.
 *
 * Verified against Apify's API v2 documentation and guides citing
 * it (read 2026-11-19):
 *  - Base URL `https://api.apify.com/v2`.
 *  - Auth: API token (Console → Settings → API & Integrations) as
 *    `Authorization: Bearer <token>`.
 *  - POST /acts/{actorId}/runs — start an Actor run (async);
 *    GET /actor-runs/{runId} — poll until status is SUCCEEDED /
 *    FAILED / ABORTED / TIMED-OUT.
 *  - GET /datasets/{datasetId}/items — read the run's results.
 *  - POST /acts/{actorId}/run-sync-get-dataset-items — run and
 *    return items directly (up to 300s; longer than the Stage-1
 *    client's 10s timeout, so the adapter uses async + poll).
 *  - Actor ids are `username~actor-name` in REST paths.
 *
 * Apify is a PLATFORM, not an enrichment database: there is no
 * built-in enrichment endpoint. The operator picks an Actor from
 * the Apify Store (e.g. a LinkedIn/company-data actor) and supplies
 * its id plus the Actor's input schema. The adapter runs that Actor
 * and preserves its dataset items generically — field names are
 * Actor-defined, so no field mapping is invented. This also means
 * Apify must never be used to run an Actor that scrapes a service
 * in violation of that service's terms; the operator chooses the
 * Actor and owns that decision.
 */

export const APIFY_CONFIG = {
  provider: "apify",
  name: "Apify",
  baseUrl: "https://api.apify.com/v2",
  docsUrl: "https://docs.apify.com/api/v2",
  authType: "api_key" as const,
  envVars: { apiKey: "APIFY_TOKEN" },
  supportedFields: [
    "email",
    "first_name",
    "last_name",
    "job_title",
    "company",
    "linkedin_url",
    "phone",
    "location",
    "company_domain",
  ],
  capabilities: [
    "Run any operator-chosen Apify Actor (async, POST /acts/{actorId}/runs)",
    "Poll run status until terminal (GET /actor-runs/{runId})",
    "Read run results from the default dataset (GET /datasets/{datasetId}/items)",
    "Actor-defined fields preserved generically — no invented mapping",
  ],
  endpointsVerified: true,
  pollIntervalMs: 5000,
  maxPollAttempts: 60,
} as const;
