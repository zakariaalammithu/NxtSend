/**
 * Trigify enrichment — config.
 *
 * STATUS: PROVIDER BLOCKED — SHUT DOWN. Trigify announced on
 * 23 September 2026 that its team is joining HubSpot and the
 * standalone platform is being wound down. For standard customers
 * access ended at 11:59pm BST on 22 October 2026; accounts are NOT
 * migrated to HubSpot, and integrations, API access, monitoring,
 * and signal collection all stop when access ends. There is no
 * Trigify API to call any more.
 *
 * Trigify was a person-level buying-signal platform (social signals
 * across 11+ platforms attached to a named person and their source
 * post, with a REST API, MCP server, and CLI on paid plans). All of
 * that is now defunct.
 */

export const TRIGIFY_CONFIG = {
  provider: "trigify",
  name: "Trigify",
  baseUrl: null,
  docsUrl: "https://www.trigify.io/",
  authType: "api_key" as const,
  envVars: { apiKey: "TRIGIFY_API_KEY" },
  supportedFields: [],
  capabilities: [
    "BLOCKED: Trigify shut down on 22 October 2026 (team joined HubSpot; standalone platform wound down)",
    "API access, monitoring, and signal collection all stopped — no endpoint exists to call",
  ],
  endpointsVerified: false,
  status: "blocked",
  blockedReason:
    "Trigify announced on 23 Sep 2026 that it is shutting down; standard-customer access ended 22 Oct 2026 and API access stopped with it.",
} as const;
