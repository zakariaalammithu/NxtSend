/**
 * Shared REST API auth — Bearer access token, platform resource.
 *
 * Mirrors resolveZapierContext (src/lib/integrations/zapier/auth.ts)
 * but platform-parameterised: every v1/webhook route for a
 * platform resolves its context here.
 *  - Demo Mode → 503 (the demo persona is never served to a REST platform).
 *  - No/invalid token, or a token bound to another resource → 401.
 *    The platform resource is passed explicitly: the REST paths do
 *    not match the resource URL exactly, so the audience cannot be
 *    derived from the request URL.
 *  - Wrong tier → 403 with a structured `{error, code}` body.
 *  - Rate limit: 120 requests/minute per access token (same
 *    in-memory fixed-window pattern as the MCP server).
 *    In-memory means per-process on serverless: a best-effort
 *    brake, not a distributed quota. The key is the SHA-256 of
 *    the token — the raw token never becomes a map key.
 *
 * Errors follow the REST convention (`{error}`) plus a `code`
 * field where it helps the caller distinguish the failure.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { createRateLimiter, type RateLimiter } from "@/lib/admin/submissions-core";
import { resolveMuseContext } from "@/lib/muse-connector/oauth/context";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { MuseOAuthStore } from "@/lib/muse-connector/oauth/store";
import { grantHasTier, type ScopeTier } from "@/lib/muse-connector/oauth/scopes";
import { getMcpResourceUrl } from "@/lib/muse-connector/oauth/config";
import {
  getPlatformConfig,
  getPlatformResourceUrl,
  platformDisplayName,
  type PlatformConfig,
  type RestPlatform,
} from "./config";
import {
  resolveApiKey,
  apiKeyHasTier,
  createSupabaseApiKeyStore,
  type ApiKeyStore,
} from "@/lib/integrations/n8n/api-keys";
import { assertProviderEnabled } from "@/lib/admin/integration-monitoring";

export const REST_RATE_LIMIT_PER_MINUTE = 120;

export type PlatformAuthError =
  | { status: 503; body: { error: string; code: string } }
  | { status: 401; body: { error: string; code: string } }
  | { status: 403; body: { error: string; code: string } }
  | { status: 429; body: { error: string; code: string } };

export interface ResolvePlatformContextDeps {
  store?: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
  rateLimiter?: RateLimiter;
}

const limiters = new Map<RestPlatform, RateLimiter>();

function limiterFor(platform: RestPlatform): RateLimiter {
  let limiter = limiters.get(platform);
  if (!limiter) {
    limiter = createRateLimiter({
      maxAttempts: REST_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    limiters.set(platform, limiter);
  }
  return limiter;
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token || null;
}

export type ResolvePlatformContextResult =
  | { ok: true; ctx: MuseAccessContext }
  | { ok: false; error: PlatformAuthError };

/**
 * Resolves + authorizes a REST API call for a platform. `tier`
 * is the minimum tier the route needs (`read` for GETs, `write`
 * for mutations). Pass `rateLimit: false` only for the health
 * endpoint (public) and for tests that drive the limiter
 * themselves.
 */
export async function resolvePlatformContext(
  req: Request,
  platform: RestPlatform,
  tier: ScopeTier,
  deps: ResolvePlatformContextDeps & { rateLimit?: boolean } = {}
): Promise<ResolvePlatformContextResult> {
  const config = getPlatformConfig(platform);
  const label = platformDisplayName(platform);
  const mode = deps.mode ?? getDataMode();
  if (mode === "demo") {
    return {
      ok: false,
      error: {
        status: 503,
        body: {
          error: `${label} is not available in Demo Mode. Connect a real Supabase project first — demo data is never shared with ${label}.`,
          code: "demo_mode",
        },
      },
    };
  }
  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      error: {
        status: 401,
        body: { error: `A valid ${label} access token is required.`, code: "unauthorized" },
      },
    };
  }
  if (deps.rateLimit !== false) {
    const limiter = deps.rateLimiter ?? limiterFor(platform);
    const key = createHash("sha256").update(token).digest("hex");
    if (!limiter.check(key, (deps.now ?? new Date()).getTime())) {
      return {
        ok: false,
        error: {
          status: 429,
          body: {
            error: `Rate limit exceeded: ${REST_RATE_LIMIT_PER_MINUTE} requests per minute per token.`,
            code: "rate_limited",
          },
        },
      };
    }
  }
  const origin = new URL(req.url).origin;
  const ctx = await resolveMuseContext(req, {
    store: deps.store,
    mode,
    now: deps.now,
    resource: getMcpResourceUrl(origin, platform),
  });
  if (!ctx) {
    return {
      ok: false,
      error: {
        status: 401,
        body: { error: `The access token is invalid, expired, or not issued for ${label}.`, code: "unauthorized" },
      },
    };
  }
  if (!grantHasTier(ctx.scopes, tier)) {
    return {
      ok: false,
      error: {
        status: 403,
        body: {
          error: `This ${label} connection does not have the ${tier} permission (needs ${config.scopePrefix}.${tier}). Reconnect with the required scope.`,
          code: "insufficient_scope",
        },
      },
    };
  }
  return { ok: true, ctx };
}

/** Shared JSON error body helper for REST platform routes. */
export function platformError(
  status: number,
  error: string,
  code?: string
): { status: number; body: Record<string, unknown> } {
  return { status, body: code ? { error, code } : { error } };
}

/** Alias for the shared REST error helper (contract name). */
export const restError = platformError;

export type RestAuthError = PlatformAuthError;

export type ResolveRestContextResult = ResolvePlatformContextResult;

export interface ResolveRestContextDeps extends ResolvePlatformContextDeps {
  /** API-key store (tests / in-memory). When omitted and `admin` is set, a Supabase store is built from it. */
  apiKeyStore?: ApiKeyStore;
  /** Service-role client, for the Supabase API-key store. */
  admin?: SupabaseClient | null;
}

const restModuleRateLimiter = createRateLimiter({
  maxAttempts: REST_RATE_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

/**
 * Resolves + authorizes a REST API call for a platform
 * (contract name for `resolvePlatformContext`, plus the n8n
 * API-key path). `platform` accepts a platform id or a full
 * `PlatformConfig`. `tier` is the minimum tier the route needs
 * (`read` for GETs, `write` for mutations).
 *
 * n8n API keys: a Bearer token starting with `nxt_live_` is
 * resolved through src/lib/integrations/n8n/api-keys.ts
 * (SHA-256 hash lookup, revoked/expired checks) instead of
 * OAuth. Zapier has no API keys — its tokens are OAuth only.
 * The rate limit is checked once, here; the OAuth delegation
 * below runs with `rateLimit: false` so a token is never
 * charged twice for one call.
 */
export async function resolveRestContext(
  req: Request,
  platform: RestPlatform | PlatformConfig,
  tier: ScopeTier,
  deps: ResolveRestContextDeps = {}
): Promise<ResolveRestContextResult> {
  const platformId: RestPlatform =
    typeof platform === "string" ? platform : platform.platform;
  const config = getPlatformConfig(platformId);
  const label = platformDisplayName(platformId);
  const mode = deps.mode ?? getDataMode();
  if (mode === "demo") {
    return {
      ok: false,
      error: {
        status: 503,
        body: {
          error: `${label} is not available in Demo Mode. Connect a real Supabase project first — demo data is never shared with ${label}.`,
          code: "demo_mode",
        },
      },
    };
  }
  // Admin kill-switch (migration 038, provider_disabled_flags): a
  // disabled platform refuses every REST call with an honest 503,
  // before any credential is checked. Skipped when no admin client
  // is available (demo / tests) and fails open when the flag table
  // cannot be read (migration unapplied) — see assertProviderEnabled.
  if (deps.admin) {
    try {
      await assertProviderEnabled(deps.admin, platformId);
    } catch (err) {
      return {
        ok: false,
        error: {
          status: 503,
          body: {
            error:
              err instanceof Error
                ? err.message
                : `Provider "${platformId}" is disabled by a platform administrator.`,
            code: "provider_disabled",
          },
        },
      };
    }
  }
  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      error: {
        status: 401,
        body: {
          error:
            platformId === "n8n"
              ? "A valid n8n access token or API key is required."
              : `A valid ${label} access token is required.`,
          code: "unauthorized",
        },
      },
    };
  }
  // `rateLimit` is an inline option on resolvePlatformContext's
  // params (not on the deps interface) — read it structurally.
  const { rateLimit } = deps as ResolveRestContextDeps & { rateLimit?: boolean };
  if (rateLimit !== false) {
    const limiter = deps.rateLimiter ?? restModuleRateLimiter;
    const key = createHash("sha256").update(token).digest("hex");
    if (!limiter.check(key, (deps.now ?? new Date()).getTime())) {
      return {
        ok: false,
        error: {
          status: 429,
          body: {
            error: `Rate limit exceeded: ${REST_RATE_LIMIT_PER_MINUTE} requests per minute per token.`,
            code: "rate_limited",
          },
        },
      };
    }
  }
  const origin = new URL(req.url).origin;
  const resource = getPlatformResourceUrl(config, origin);

  if (platformId === "n8n" && token.startsWith("nxt_live_")) {
    const store =
      deps.apiKeyStore ?? (deps.admin ? createSupabaseApiKeyStore(deps.admin) : null);
    if (!store) {
      return {
        ok: false,
        error: {
          status: 401,
          body: { error: "The API key could not be verified on this deployment.", code: "unauthorized" },
        },
      };
    }
    const resolved = await resolveApiKey(store, token);
    if (!resolved.ok) {
      const reason =
        resolved.reason === "revoked"
          ? "The API key has been revoked."
          : resolved.reason === "expired"
            ? "The API key has expired."
            : "The API key is invalid.";
      return {
        ok: false,
        error: { status: 401, body: { error: reason, code: "unauthorized" } },
      };
    }
    if (!apiKeyHasTier(resolved.scopes, tier)) {
      return {
        ok: false,
        error: {
          status: 403,
          body: {
            error: `This n8n API key does not have the ${tier} permission (needs n8n.${tier}). Create a key with that scope.`,
            code: "insufficient_scope",
          },
        },
      };
    }
    return {
      ok: true,
      ctx: {
        userId: resolved.userId,
        workspaceId: resolved.workspaceId,
        scopes: [...resolved.scopes],
        clientId: "n8n-api-key",
        grantId: `api-key:${resolved.userId}`,
        resource,
      },
    };
  }

  return resolvePlatformContext(
    req,
    platformId,
    tier,
    {
      store: deps.store,
      mode: deps.mode,
      now: deps.now,
      rateLimiter: deps.rateLimiter,
      rateLimit: false,
    }
  );
}
