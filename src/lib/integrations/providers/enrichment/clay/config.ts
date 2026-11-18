/**
 * Clay enrichment — config.
 *
 * Verified against Clay's developer documentation as cited by
 * multiple guides checked against it (developers.clay.com,
 * agent-docs.clay.com, read 2026-11-19):
 *  - Public API launched 9 July 2026, base
 *    `https://api.clay.com/public/v0`, auth via the `clay-api-key`
 *    header (key created in Clay under Settings → Account →
 *    API keys).
 *  - GET /me — authenticated identity check.
 *  - Routines (Clay-managed functions such as work email, phone,
 *    company data, tech stack, funding; plus custom functions):
 *    POST /routines/{routine_id}/run {items: [{id, inputs}]} →
 *    {routine_run_id}; poll GET /routines/run/{routine_run_id}/results
 *    — HTTP 202 while running, 200 when complete. Inline runs take
 *    1–100 items. Batch runs: POST /routines/{id}/run-batch/upload-url,
 *    PUT the JSONL file, POST /routines/{id}/run-batch/start {file_id},
 *    poll run-batch/{run_id}/results.
 *  - Searches: GET /search/query-mode/reference first, then
 *    create-and-page a search (query-mode; filters-mode deprecated).
 *  - The operator supplies the routine id (a Clay-managed function
 *    id or a custom routine id from their workspace) — NxtSend does
 *    not invent one. Result field names are routine-defined, so the
 *    adapter preserves every output field generically with source
 *    `clay:<routineId>`.
 */

export const CLAY_CONFIG = {
  provider: "clay",
  name: "Clay",
  baseUrl: "https://api.clay.com/public/v0",
  docsUrl: "https://developers.clay.com",
  authType: "api_key" as const,
  envVars: { apiKey: "CLAY_API_KEY" },
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
    "company_domain",
  ],
  capabilities: [
    "Run a Clay routine (enrichment, research, scoring) over 1–100 items (POST /routines/{id}/run)",
    "Poll routine results until complete (GET /routines/run/{run_id}/results)",
    "Batch runs over a JSONL upload (run-batch/upload-url → start → results)",
    "Search Clay's GTM database — people and companies (query-mode)",
    "Connection check (GET /me)",
  ],
  endpointsVerified: true,
  inlineRunMaxItems: 100,
  pollIntervalMs: 5000,
  maxPollAttempts: 24,
} as const;
