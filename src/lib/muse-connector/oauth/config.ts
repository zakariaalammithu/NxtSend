/**
 * Muse MCP public-URL / feature-flag config.
 *
 * MUSE_MCP_ENABLED gates the Muse surface (the MCP server, owned by
 * the MCP worker, reads this flag; the OAuth routes below stay
 * available so a disabled MCP server fails at the resource, not with
 * a half-issued grant). MUSE_MCP_PUBLIC_URL is the public origin
 * advertised in the RFC 9728 protected-resource metadata — only set
 * it when the MCP surface lives somewhere other than
 * NEXT_PUBLIC_APP_URL.
 */

export interface MuseMcpEnv {
  MUSE_MCP_ENABLED?: string;
  MUSE_MCP_PUBLIC_URL?: string;
  CHATGPT_MCP_ENABLED?: string;
  CHATGPT_MCP_PUBLIC_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

function envFromProcess(): MuseMcpEnv {
  return {
    MUSE_MCP_ENABLED: process.env.MUSE_MCP_ENABLED,
    MUSE_MCP_PUBLIC_URL: process.env.MUSE_MCP_PUBLIC_URL,
    CHATGPT_MCP_ENABLED: process.env.CHATGPT_MCP_ENABLED,
    CHATGPT_MCP_PUBLIC_URL: process.env.CHATGPT_MCP_PUBLIC_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/** Parses one on/off flag value; null when the raw value is absent/blank. */
function parseEnabledFlag(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

/** True unless explicitly disabled — unset means the surface is on. */
export function isMuseMcpEnabled(env: MuseMcpEnv = envFromProcess()): boolean {
  return parseEnabledFlag(env.MUSE_MCP_ENABLED) ?? true;
}

/**
 * ChatGPT MCP surface flag, mirroring isMuseMcpEnabled with one
 * precedence rule: CHATGPT_MCP_ENABLED wins when set; otherwise the
 * MUSE_MCP_ENABLED value applies; otherwise the surface is on.
 * The OAuth routes are never gated by this flag (same rule as Muse).
 */
export function isChatGptMcpEnabled(env: MuseMcpEnv = envFromProcess()): boolean {
  return parseEnabledFlag(env.CHATGPT_MCP_ENABLED) ?? isMuseMcpEnabled(env);
}

/** Validates a raw origin string into an origin, or null. */
function parsePublicUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Public origin of the Muse surface: MUSE_MCP_PUBLIC_URL when set,
 * else NEXT_PUBLIC_APP_URL, else the request origin passed in.
 * Trailing slashes are stripped; returns null when nothing usable
 * is configured.
 */
export function getMusePublicUrl(
  requestOrigin?: string,
  env: MuseMcpEnv = envFromProcess()
): string | null {
  return (
    parsePublicUrl(env.MUSE_MCP_PUBLIC_URL) ??
    parsePublicUrl(env.NEXT_PUBLIC_APP_URL) ??
    parsePublicUrl(requestOrigin)
  );
}

/**
 * Public origin of the ChatGPT surface, same shape as
 * getMusePublicUrl with one precedence rule: CHATGPT_MCP_PUBLIC_URL
 * wins when set, else MUSE_MCP_PUBLIC_URL, else NEXT_PUBLIC_APP_URL,
 * else the request origin. Returns null when nothing usable is set.
 */
export function getChatGptPublicUrl(
  requestOrigin?: string,
  env: MuseMcpEnv = envFromProcess()
): string | null {
  return (
    parsePublicUrl(env.CHATGPT_MCP_PUBLIC_URL) ??
    parsePublicUrl(env.MUSE_MCP_PUBLIC_URL) ??
    parsePublicUrl(env.NEXT_PUBLIC_APP_URL) ??
    parsePublicUrl(requestOrigin)
  );
}

// ── MCP resources (RFC 8707 `resource` / RFC 9728 audience) ────────────────

export type McpPlatform = "muse" | "chatgpt";

/** Canonical public origin when no origin can be determined. */
export const DEFAULT_OAUTH_ORIGIN = "https://nxtsend.com";

/** Path of each platform's MCP resource, relative to the origin. */
export const MCP_RESOURCE_PATHS: Record<McpPlatform, string> = {
  muse: "/api/mcp",
  chatgpt: "/api/mcp/chatgpt",
};

/** Full resource URL of a platform's MCP server for an origin. */
export function getMcpResourceUrl(origin: string, platform: McpPlatform): string {
  return `${origin.replace(/\/+$/, "")}${MCP_RESOURCE_PATHS[platform]}`;
}

/** Both canonical MCP resource URLs for an origin. */
export function canonicalMcpResources(origin: string): string[] {
  return [getMcpResourceUrl(origin, "muse"), getMcpResourceUrl(origin, "chatgpt")];
}

/**
 * Which platform a resource URL belongs to (matched on the URL
 * path, so any origin works), or null when it is neither MCP
 * resource.
 */
export function resourcePlatform(resource: string | null | undefined): McpPlatform | null {
  if (!resource) return null;
  try {
    const pathname = new URL(resource).pathname.replace(/\/+$/, "");
    if (pathname === MCP_RESOURCE_PATHS.chatgpt) return "chatgpt";
    if (pathname === MCP_RESOURCE_PATHS.muse) return "muse";
    return null;
  } catch {
    return null;
  }
}

/**
 * The authorization server issuer (RFC 8414 / RFC 9207 `iss`): the
 * public origin of this deployment, falling back to the request
 * origin and then the canonical origin. Never null.
 */
export function getOAuthIssuer(requestOrigin?: string, env: MuseMcpEnv = envFromProcess()): string {
  return getMusePublicUrl(requestOrigin, env) ?? DEFAULT_OAUTH_ORIGIN;
}
