/**
 * Shared guard for the n8n webhook routes (Bearer, OAuth).
 *
 * Not a route file: resolves the platform context (demo → 503,
 * bad token / wrong resource → 401, wrong tier → 403, rate
 * limit → 429) and builds the platform-bound webhook store.
 * The n8n surface is gated by N8N_INTEGRATION_ENABLED (default
 * on); the OAuth routes stay available when disabled, same rule
 * as the Zapier surface.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isN8nEnabled } from "@/lib/integrations-center/status";
import { resolvePlatformContext } from "@/lib/integrations/rest/auth";
import { createPlatformStore, type PlatformWebhookStore } from "@/lib/integrations/rest/outbox";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { ScopeTier } from "@/lib/muse-connector/oauth/scopes";

export type N8nWebhookRoute =
  | { ok: true; ctx: MuseAccessContext; store: PlatformWebhookStore }
  | { ok: false; response: NextResponse };

export async function resolveN8nWebhookRoute(
  req: Request,
  tier: ScopeTier
): Promise<N8nWebhookRoute> {
  try {
    if (!isN8nEnabled()) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "The n8n integration is disabled on this deployment.", code: "n8n_disabled" },
          { status: 503 }
        ),
      };
    }
    const resolved = await resolvePlatformContext(req, "n8n", tier);
    if (!resolved.ok) {
      return {
        ok: false,
        response: NextResponse.json(resolved.error.body, { status: resolved.error.status }),
      };
    }
    const admin = createAdminClient();
    if (!admin) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "The n8n integration is not configured on this deployment.", code: "not_configured" },
          { status: 503 }
        ),
      };
    }
    return { ok: true, ctx: resolved.ctx, store: createPlatformStore(admin, "n8n") };
  } catch (err) {
    console.error("[NxtSend] n8n webhook route error:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "An unexpected error occurred.", code: "internal_error" },
        { status: 500 }
      ),
    };
  }
}

/** Reads a JSON body, or null when it is missing/unreadable. */
export async function readN8nJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await req.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
