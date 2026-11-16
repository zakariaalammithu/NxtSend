/**
 * Zapier REST API auth — Bearer access token, Zapier resource.
 *
 * Every v1 route resolves its context here:
 *  - Demo Mode → 503 (the demo persona is never served to Zapier).
 *  - No/invalid token, or a token bound to another resource
 *    (Muse/ChatGPT/Claude) → 401. The Zapier resource is passed
 *    explicitly: unlike the MCP routes, the Zapier paths do not
 *    match the resource URL exactly, so the audience cannot be
 *    derived from the request URL.
 *  - Wrong tier → 403 with a structured `{error, code}` body.
 *  - Rate limit: 120 requests/minute per access token (same
 *    in-memory fixed-window pattern as the MCP server —
 *    createRateLimiter in src/lib/admin/submissions-core.ts).
 *    In-memory means per-process on serverless: a best-effort
 *    brake, not a distributed quota. The key is the SHA-256 of
 *    the token — the raw token never becomes a map key.
 *
 * Errors follow the REST convention (`{error}`) plus a `code`
 * field where it helps Zapier distinguish the failure.
 */

import { createHash } from "crypto";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { createRateLimiter, type RateLimiter } from "@/lib/admin/submissions-core";
import { resolveMuseContext } from "@/lib/muse-connector/oauth/context";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { MuseOAuthStore } from "@/lib/muse-connector/oauth/store";
import { grantHasTier, type ScopeTier } from "@/lib/muse-connector/oauth/scopes";
import { getZapierResourceUrl } from "./config";

export const ZAPIER_RATE_LIMIT_PER_MINUTE = 120;
export const ZAPIER_DEMO_ERROR =
  "Zapier is not available in Demo Mode. Connect a real Supabase project first — demo data is never shared with Zapier.";

export type ZapierAuthError =
  | { status: 503; body: { error: string; code: string } }
  | { status: 401; body: { error: string; code: string } }
  | { status: 403; body: { error: string; code: string } }
  | { status: 429; body: { error: string; code: string } };

export interface ResolveZapierContextDeps {
  store?: MuseOAuthStore;
  mode?: DataMode;
  now?: Date;
  rateLimiter?: RateLimiter;
}

const moduleRateLimiter = createRateLimiter({
  maxAttempts: ZAPIER_RATE_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token || null;
}

export type ResolveZapierContextResult =
  | { ok: true; ctx: MuseAccessContext }
  | { ok: false; error: ZapierAuthError };

/**
 * Resolves + authorizes a Zapier API call. `tier` is the minimum
 * tier the route needs (`read` for GETs, `write` for mutations).
 * Pass `rateLimit: false` only for the health endpoint (public)
 * and for tests that drive the limiter themselves.
 */
export async function resolveZapierContext(
  req: Request,
  tier: ScopeTier,
  deps: ResolveZapierContextDeps = {}
): Promise<ResolveZapierContextResult> {
  const mode = deps.mode ?? getDataMode();
  if (mode === "demo") {
    return {
      ok: false,
      error: { status: 503, body: { error: ZAPIER_DEMO_ERROR, code: "demo_mode" } },
    };
  }
  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      error: {
        status: 401,
        body: { error: "A valid Zapier access token is required.", code: "unauthorized" },
      },
    };
  }
  const limiter = deps.rateLimiter ?? moduleRateLimiter;
  const key = createHash("sha256").update(token).digest("hex");
  if (!limiter.check(key, (deps.now ?? new Date()).getTime())) {
    return {
      ok: false,
      error: {
        status: 429,
        body: {
          error: `Rate limit exceeded: ${ZAPIER_RATE_LIMIT_PER_MINUTE} requests per minute per token.`,
          code: "rate_limited",
        },
      },
    };
  }
  const origin = new URL(req.url).origin;
  const ctx = await resolveMuseContext(req, {
    store: deps.store,
    mode,
    now: deps.now,
    resource: getZapierResourceUrl(origin),
  });
  if (!ctx) {
    return {
      ok: false,
      error: {
        status: 401,
        body: { error: "The access token is invalid, expired, or not issued for Zapier.", code: "unauthorized" },
      },
    };
  }
  if (!grantHasTier(ctx.scopes, tier)) {
    return {
      ok: false,
      error: {
        status: 403,
        body: {
          error: `This Zapier connection does not have the ${tier} permission (needs zapier.${tier}). Reconnect with the required scope.`,
          code: "insufficient_scope",
        },
      },
    };
  }
  return { ok: true, ctx };
}

/** Shared JSON error body helper for Zapier routes. */
export function zapierError(
  status: number,
  error: string,
  code?: string
): { status: number; body: Record<string, unknown> } {
  return { status, body: code ? { error, code } : { error } };
}
