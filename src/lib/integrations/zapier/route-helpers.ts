/**
 * Thin-route helpers for the Zapier REST API.
 *
 * Route files under src/app/api/integrations/zapier/v1/* do three
 * things and nothing else: resolve the Zapier context (auth + tier
 * + rate limit), build the api.ts deps, and call one api function.
 * All business logic lives in ./api.ts so it stays unit-testable.
 *
 * Demo Mode is refused by resolveZapierContext (503) before any
 * repo is built. When ZAPIER_ENABLED is false the surface answers
 * 503 (the OAuth routes stay available, same rule as the MCP
 * surfaces). An unexpected error becomes a generic 500 — internals
 * are never leaked to Zapier.
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
import {
  ResendEmailAdapter,
  createConversationRoutingAdapter,
} from "@/lib/email";
import { sendInboxReply } from "@/lib/inbox/reply";
import { resolveZapierContext } from "./auth";
import { isZapierEnabled } from "./config";
import { emitZapierEvent } from "./emit";
import {
  createSupabaseZapierStore,
  getDemoZapierStore,
} from "./outbox";
import { recordZapierAudit } from "./audit";
import type { ZapierApiDeps, ZapierApiResult } from "./api";

export async function readZapierJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await req.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toResponse(result: ZapierApiResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}

export async function buildZapierApiDeps(
  admin: SupabaseClient | null
): Promise<ZapierApiDeps> {
  const mode = getDataMode();
  const zapierStore = admin ? createSupabaseZapierStore(admin) : getDemoZapierStore();
  const inboxRepo = createInboxRepository(mode, admin);
  return {
    leads: createLeadsRepository(mode),
    campaigns: createCampaignsRepository(mode),
    inbox: inboxRepo,
    accounts: createAccountsRepository(mode),
    usage: createUsageRepository(mode),
    mode,
    zapierStore,
    emit: (type, workspaceId, data) => emitZapierEvent({ store: zapierStore }, type, workspaceId, data),
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
    audit: (input) => recordZapierAudit({ ...input, admin }),
  };
}

/**
 * Runs one Zapier v1 handler with auth + tier + deps. `tier` is
 * "read" for GETs and "write" for mutations.
 */
export async function withZapierRoute(
  req: Request,
  tier: ScopeTier,
  handler: (ctx: MuseAccessContext, deps: ZapierApiDeps) => Promise<ZapierApiResult>
): Promise<NextResponse> {
  try {
    if (!isZapierEnabled()) {
      return NextResponse.json(
        { error: "The Zapier integration is disabled on this deployment.", code: "zapier_disabled" },
        { status: 503 }
      );
    }
    const resolved = await resolveZapierContext(req, tier);
    if (!resolved.ok) {
      return NextResponse.json(resolved.error.body, { status: resolved.error.status });
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "The Zapier integration is not configured on this deployment.", code: "not_configured" },
        { status: 503 }
      );
    }
    const deps = await buildZapierApiDeps(admin);
    return toResponse(await handler(resolved.ctx, deps));
  } catch (err) {
    console.error("[NxtSend] Zapier API error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred.", code: "internal_error" },
      { status: 500 }
    );
  }
}
