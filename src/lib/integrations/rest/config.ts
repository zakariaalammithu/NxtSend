/**
 * Shared REST platform config (Zapier + n8n).
 *
 * NOTE (Worker B): Worker A was contracted to deliver
 * `src/lib/integrations/rest/` alongside the n8n v1 API, but no
 * `rest/` directory existed in this checkout when this work
 * started, so this module was written here to the agreed
 * contract (same names, same shapes) as a thin adapter over the
 * existing Zapier outbox. If Worker A lands its own `rest/`
 * implementation, the two must be reconciled at merge — this one
 * is deliberately small and adapter-shaped so either side can
 * win. The n8n webhook routes, emit fan-out and jobs workers in
 * this change import from here, not from Worker A's (absent)
 * copy.
 *
 * One platform, one resource, one scope prefix. The prefix is
 * provenance (which platform the grant is for), not privilege —
 * authorization always goes through `grantHasTier`.
 */

export type RestPlatform = "zapier" | "n8n";

export interface PlatformConfig {
  platform: RestPlatform;
  /** RFC 8707 resource path, relative to the origin. */
  resourcePath: string;
  /** OAuth scope prefix, e.g. "n8n" for `n8n.read`. */
  scopePrefix: string;
  /** Env flag gating the REST surface (OAuth stays available). */
  enabledEnv: string;
  /** Env var holding the public base URL for metadata. */
  baseUrlEnv: string;
  /** Audit-log action prefix, e.g. "n8n" for `n8n.lead_created`. */
  auditPrefix: string;
}

export const ZAPIER_PLATFORM: PlatformConfig = {
  platform: "zapier",
  resourcePath: "/api/integrations/zapier",
  scopePrefix: "zapier",
  enabledEnv: "ZAPIER_ENABLED",
  baseUrlEnv: "ZAPIER_APP_BASE_URL",
  auditPrefix: "zapier",
};

export const N8N_PLATFORM: PlatformConfig = {
  platform: "n8n",
  resourcePath: "/api/integrations/n8n",
  scopePrefix: "n8n",
  enabledEnv: "N8N_INTEGRATION_ENABLED",
  baseUrlEnv: "N8N_API_BASE_URL",
  auditPrefix: "n8n",
};

export const N8N_API_VERSION = "1.0.0";

/** Contract alias for the platform id type. */
export type PlatformId = RestPlatform;

export const PLATFORM_CONFIGS: Record<RestPlatform, PlatformConfig> = {
  zapier: ZAPIER_PLATFORM,
  n8n: N8N_PLATFORM,
};

/** Config for a platform; throws on an unknown platform name. Accepts a config object as-is. */
export function getPlatformConfig(platform: RestPlatform | PlatformConfig): PlatformConfig {
  if (typeof platform !== "string") return platform;
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown REST platform: ${String(platform)}`);
  return config;
}

export function isRestPlatform(value: unknown): value is RestPlatform {
  return value === "zapier" || value === "n8n";
}

export type PlatformEnv = Record<string, string | undefined>;

function envFromProcess(): PlatformEnv {
  return process.env as PlatformEnv;
}

function parseEnabledFlag(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

/** True unless explicitly disabled — unset means the surface is on. */
export function isPlatformEnabled(
  platform: RestPlatform | PlatformConfig,
  env: PlatformEnv = envFromProcess()
): boolean {
  const config = getPlatformConfig(platform);
  return parseEnabledFlag(env[config.enabledEnv]) ?? true;
}

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
 * Public origin of the platform surface: baseUrlEnv when set,
 * else NEXT_PUBLIC_APP_URL, else the request origin passed in.
 * Returns null when nothing usable is configured.
 */
export function getPlatformBaseUrl(
  platform: RestPlatform | PlatformConfig,
  requestOrigin?: string,
  env: PlatformEnv = envFromProcess()
): string | null {
  const config = getPlatformConfig(platform);
  return (
    parsePublicUrl(env[config.baseUrlEnv]) ??
    parsePublicUrl(env.NEXT_PUBLIC_APP_URL) ??
    parsePublicUrl(requestOrigin)
  );
}

/** Full resource URL of the platform REST API for an origin. */
export function getPlatformResourceUrl(
  platform: RestPlatform | PlatformConfig,
  origin: string
): string {
  const config = getPlatformConfig(platform);
  return `${origin.replace(/\/+$/, "")}${config.resourcePath}`;
}

/** Display name used in user-facing messages ("Zapier" / "n8n"). */
export function platformDisplayName(platform: RestPlatform | PlatformConfig): string {
  const id = typeof platform === "string" ? platform : platform.platform;
  return id === "n8n" ? "n8n" : "Zapier";
}
