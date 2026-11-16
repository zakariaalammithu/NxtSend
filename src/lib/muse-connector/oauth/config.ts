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
  NEXT_PUBLIC_APP_URL?: string;
}

function envFromProcess(): MuseMcpEnv {
  return {
    MUSE_MCP_ENABLED: process.env.MUSE_MCP_ENABLED,
    MUSE_MCP_PUBLIC_URL: process.env.MUSE_MCP_PUBLIC_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/** True unless explicitly disabled — unset means the surface is on. */
export function isMuseMcpEnabled(env: MuseMcpEnv = envFromProcess()): boolean {
  const raw = env.MUSE_MCP_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== "false" && raw !== "0" && raw !== "no" && raw !== "off";
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
  const raw = env.MUSE_MCP_PUBLIC_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
