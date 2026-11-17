/**
 * Zapier REST API auth — Bearer access token, Zapier resource.
 *
 * Thin wrapper over the shared resolver
 * (src/lib/integrations/rest/auth.ts): same demo refusal (503,
 * platform-aware message), same 401/403/429 shapes, same
 * 120/min per-token rate limit. Zapier has no API keys — its
 * tokens are OAuth only.
 */

import { resolveRestContext, restError, REST_RATE_LIMIT_PER_MINUTE } from "@/lib/integrations/rest/auth";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import type { ResolveRestContextDeps, ResolveRestContextResult } from "@/lib/integrations/rest/auth";
import type { ScopeTier } from "@/lib/muse-connector/oauth/scopes";

export { REST_RATE_LIMIT_PER_MINUTE as ZAPIER_RATE_LIMIT_PER_MINUTE };

export const ZAPIER_DEMO_ERROR =
  "Zapier is not available in Demo Mode. Connect a real Supabase project first — demo data is never shared with Zapier.";

export type ZapierAuthError =
  | { status: 503; body: { error: string; code: string } }
  | { status: 401; body: { error: string; code: string } }
  | { status: 403; body: { error: string; code: string } }
  | { status: 429; body: { error: string; code: string } };

export type ResolveZapierContextDeps = Omit<ResolveRestContextDeps, "apiKeyStore" | "admin">;

export type ResolveZapierContextResult = ResolveRestContextResult;

/**
 * Resolves + authorizes a Zapier API call. `tier` is the minimum
 * tier the route needs (`read` for GETs, `write` for mutations).
 */
export async function resolveZapierContext(
  req: Request,
  tier: ScopeTier,
  deps: ResolveZapierContextDeps = {}
): Promise<ResolveZapierContextResult> {
  return resolveRestContext(req, ZAPIER_PLATFORM, tier, deps);
}

/** Shared JSON error body helper for Zapier routes. */
export const zapierError = restError;
