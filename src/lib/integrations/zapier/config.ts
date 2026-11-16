/**
 * Zapier integration — config.
 *
 * `ZAPIER_ENABLED` gates the Zapier REST API surface (the OAuth
 * routes stay available when disabled, same rule as the MCP
 * surfaces, so a grant can never be half-issued against a dead
 * API). `ZAPIER_APP_BASE_URL` is the public origin advertised in
 * the Zapier protected-resource metadata; precedence is
 * ZAPIER_APP_BASE_URL → NEXT_PUBLIC_APP_URL → request origin,
 * following the oauth/config.ts pattern.
 *
 * There are deliberately NO OAuth client id/secret vars here: the
 * Zapier client is created by a one-time Dynamic Client
 * Registration call (see docs/zapier-integration/ZAPIER_SERVER.md)
 * and its credentials live in the Zapier developer dashboard, not
 * in this app's env. There is also NO global webhook signing secret
 * var: each Zapier webhook subscription gets its own secret,
 * generated server-side at subscribe time (see ./outbox.ts).
 */

export const ZAPIER_API_VERSION = "1.0.0";

/** Path of the Zapier REST API resource, relative to the origin. */
export const ZAPIER_RESOURCE_PATH = "/api/integrations/zapier";

export interface ZapierEnv {
  ZAPIER_ENABLED?: string;
  ZAPIER_APP_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

function envFromProcess(): ZapierEnv {
  return {
    ZAPIER_ENABLED: process.env.ZAPIER_ENABLED,
    ZAPIER_APP_BASE_URL: process.env.ZAPIER_APP_BASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function parseEnabledFlag(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

/** True unless explicitly disabled — unset means the surface is on. */
export function isZapierEnabled(env: ZapierEnv = envFromProcess()): boolean {
  return parseEnabledFlag(env.ZAPIER_ENABLED) ?? true;
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
 * Public origin of the Zapier surface: ZAPIER_APP_BASE_URL when
 * set, else NEXT_PUBLIC_APP_URL, else the request origin passed in.
 * Returns null when nothing usable is configured.
 */
export function getZapierBaseUrl(
  requestOrigin?: string,
  env: ZapierEnv = envFromProcess()
): string | null {
  return (
    parsePublicUrl(env.ZAPIER_APP_BASE_URL) ??
    parsePublicUrl(env.NEXT_PUBLIC_APP_URL) ??
    parsePublicUrl(requestOrigin)
  );
}

/** Full resource URL of the Zapier REST API for an origin. */
export function getZapierResourceUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${ZAPIER_RESOURCE_PATH}`;
}
