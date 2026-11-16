/**
 * PostgREST `.or()` filter for the audit-log action column, used by
 * GET /api/muse/activity.
 *
 * Default (no platform): Muse MCP tool calls (`muse.tool.*`) and
 * OAuth-server events (`MUSE_OAUTH_*`) — shared by the Muse,
 * ChatGPT and Claude panels. `platform=zapier`: only the Zapier
 * REST API's `zapier.*` entries. Unknown values fall back to the
 * default filter (never widened, never empty).
 *
 * Lives here (not in the route file) because a Next.js route module
 * may only export HTTP handlers — an extra export breaks the
 * route's generated type check.
 */
export function activityActionFilter(platform: string | null): string {
  if (platform === "zapier") return "action.ilike.zapier.%";
  return "action.ilike.muse.%,action.ilike.MUSE_OAUTH%";
}
