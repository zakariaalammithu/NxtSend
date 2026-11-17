/**
 * Thin-route helpers for the shared REST API (Zapier + n8n).
 *
 * Route files under src/app/api/integrations/<platform>/v1/* do
 * three things and nothing else: resolve the platform context
 * (auth + tier + rate limit), build the api.ts deps, and call one
 * api function. All business logic lives in ./api.ts so it stays
 * unit-testable.
 *
 * Demo Mode is refused by resolveRestContext (503) before any
 * repo is built. When the platform is disabled the surface
 * answers 503 (the OAuth routes stay available, same rule as the
 * MCP surfaces). An unexpected error becomes a generic 500 —
 * internals are never leaked to the caller.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { ScopeTier } from "@/lib/muse-connector/oauth/scopes";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { createLeadsRepository } from "@/lib/data/leads";
import { createCampaignsRepository } from "@/lib/data/campaigns";
import { createInboxRepository } from "@/lib/data/inbox";
import { createAccountsRepository } from "@/lib/data/accounts";
import { createUsageRepository } from "@/lib/data/usage";
import { createScheduledRepliesRepository } from "@/lib/data/scheduled-replies";
import {
  ResendEmailAdapter,
  createConversationRoutingAdapter,
} from "@/lib/email";
import { sendInboxReply } from "@/lib/inbox/reply";
import { resolveRestContext } from "./auth";
import {
  getPlatformConfig,
  isPlatformEnabled,
  platformDisplayName,
  type PlatformConfig,
  type PlatformId,
} from "./config";
import { emitPlatformEvent } from "./emit";
import {
  createPlatformStore,
  getDemoPlatformStore,
} from "./outbox";
import { recordPlatformAudit } from "./audit";
import type { RestApiDeps, RestApiResult } from "./api";

export async function readRestJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await req.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toResponse(result: RestApiResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}

export async function buildRestApiDeps(
  admin: SupabaseClient | null,
  platform: PlatformId | PlatformConfig
): Promise<RestApiDeps> {
  const config = getPlatformConfig(platform);
  const mode = getDataMode();
  const store = admin ? createPlatformStore(admin, config.platform) : getDemoPlatformStore();
  const inboxRepo = createInboxRepository(mode, admin);
  return {
    platform: config,
    leads: createLeadsRepository(mode),
    campaigns: createCampaignsRepository(mode),
    inbox: inboxRepo,
    accounts: createAccountsRepository(mode),
    usage: createUsageRepository(mode),
    scheduledReplies: createScheduledRepliesRepository(mode),
    mode,
    store,
    emit: (type, workspaceId, data) => emitPlatformEvent({ store }, type, workspaceId, data),
    sendReply: (args) => {
      const adapter =
        admin != null
          ? createConversationRoutingAdapter(admin, args.conversationId)
          : new ResendEmailAdapter({ skipMessageRecord: true });
      return sendInboxReply({ repo: inboxRepo, adapter }, args);
    },
    getUserLabel: async (userId) => {
      if (!admin) return null;
      const { data } = await admin.auth.admin.getUserById(userId);
      if (!data?.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    getWorkspaceLabel: async (workspaceId) => {
      if (!admin) return null;
      const { data } = await admin
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .maybeSingle();
      if (!data) return null;
      return { id: workspaceId, name: (data as { name?: string }).name ?? null };
    },
    audit: (input) =>
      recordPlatformAudit({ platform: config.platform, ...input, admin }),
  };
}

/**
 * Runs one v1 handler with auth + tier + deps. `tier` is
 * "read" for GETs and "write" for mutations.
 */
export async function withRestRoute(
  req: Request,
  platform: PlatformId | PlatformConfig,
  tier: ScopeTier,
  handler: (ctx: MuseAccessContext, deps: RestApiDeps) => Promise<RestApiResult>
): Promise<NextResponse> {
  const config = getPlatformConfig(platform);
  const label = platformDisplayName(config);
  try {
    if (!isPlatformEnabled(config)) {
      return NextResponse.json(
        { error: `The ${label} integration is disabled on this deployment.`, code: `${config.platform}_disabled` },
        { status: 503 }
      );
    }
    // The admin client is created BEFORE auth: n8n API-key
    // resolution needs it (the Supabase key store).
    const admin = createAdminClient();
    const resolved = await resolveRestContext(req, config, tier, { admin });
    if (!resolved.ok) {
      return NextResponse.json(resolved.error.body, { status: resolved.error.status });
    }
    if (!admin) {
      return NextResponse.json(
        { error: `The ${label} integration is not configured on this deployment.`, code: "not_configured" },
        { status: 503 }
      );
    }
    const deps = await buildRestApiDeps(admin, config);
    return toResponse(await handler(resolved.ctx, deps));
  } catch (err) {
    console.error(`[NxtSend] ${label} API error:`, err);
    return NextResponse.json(
      { error: "An unexpected error occurred.", code: "internal_error" },
      { status: 500 }
    );
  }
}
