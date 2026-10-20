import { NextResponse } from "next/server";
import { getIntegrationDescriptor } from "@/lib/integrations-center/registry";
import { verifyIntegration, type VerifyDeps } from "@/lib/integrations-center/verify";
import { recordVerification } from "@/lib/integrations-center/verification-store";
import {
  resolveCenterContext,
  isWorkspaceAdminRole,
} from "@/lib/integrations-center/server";
import { generateId } from "@/lib/utils";
import type { WebhookEnvelope, WebhookEventType } from "@/lib/webhooks/events";
import { dispatchEvent, getDemoWebhookStore } from "@/lib/webhooks/dispatch";
import { getDemoWebhookConfig } from "@/lib/webhooks/server";
import {
  getWorkspaceWebhookConfig,
  createSupabaseWebhookStore,
} from "@/lib/webhooks/store";
import { verifyOAuthConnection } from "@/lib/oauth/service";

/**
 * POST /api/integrations/[id]/verify
 *
 * Test Connection. Performs ONE safe, read-only verification call for
 * the integration (see src/lib/integrations-center/verify.ts) and
 * returns { status, checkedAt, message } — never any secret material.
 *
 * Guards:
 *  - Unknown integration id -> 404.
 *  - Live mode: session required (via resolveCenterContext) AND the
 *    caller must be a workspace owner/admin — verification uses the
 *    workspace's credentials and writes the verification record.
 *  - Demo mode: no provider is called; the honest demo result is
 *    returned (the webhooks test event is dispatched as a SIMULATED
 *    delivery through the existing pipeline).
 *  - Missing configuration: the verify service refuses BEFORE any
 *    outbound call and reports Configuration Required / Not Connected.
 *
 * Successful/failed real attempts are persisted (migration 006) so the
 * hub can show "Connected and Verified" across sessions.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const descriptor = getIntegrationDescriptor(params.id);
  if (!descriptor) {
    return NextResponse.json(
      { error: `Unknown integration: ${params.id}` },
      { status: 404 }
    );
  }

  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  if (ctx.mode !== "demo" && !isWorkspaceAdminRole(ctx.workspaceRole)) {
    return NextResponse.json(
      {
        error:
          "Forbidden: verifying an integration requires a workspace owner or admin role.",
      },
      { status: 403 }
    );
  }

  // ── Webhooks test-event dispatcher (route-composed) ──────────────────
  let webhookConfigured = false;
  let dispatchTestEvent: VerifyDeps["dispatchTestEvent"];
  const testEnvelope = (): WebhookEnvelope => ({
    id: generateId(),
    // Deliberately NOT one of the product event types: this is a
    // connection test, dispatched through the same signed pipeline.
    type: "nxtsend.test" as WebhookEventType,
    created_at: new Date().toISOString(),
    workspace_id: ctx.workspaceId,
    data: { test: true, source: "integration-center" },
  });

  if (ctx.mode === "demo") {
    const config = getDemoWebhookConfig();
    webhookConfigured = Boolean(config && config.enabled);
    if (config && config.enabled) {
      dispatchTestEvent = async () => {
        const delivery = await dispatchEvent(
          { store: getDemoWebhookStore(), simulated: true },
          config,
          testEnvelope()
        );
        return { status: delivery.status };
      };
    }
  } else if (ctx.admin) {
    const config = await getWorkspaceWebhookConfig(ctx.admin, ctx.workspaceId);
    webhookConfigured = Boolean(config && config.enabled);
    if (config && config.enabled && ctx.admin) {
      const admin = ctx.admin;
      dispatchTestEvent = async () => {
        const delivery = await dispatchEvent(
          { store: createSupabaseWebhookStore(admin) },
          config,
          testEnvelope()
        );
        return { status: delivery.status };
      };
    }
  }

  // ── Mailbox (Gmail / Outlook) real verification ────────────────────
  // Composed here because it needs the caller's workspace + the
  // service role: it validates the stored OAuth grant against the
  // provider (token refresh + profile re-fetch). Live mode only.
  let mailboxVerify: VerifyDeps["mailboxVerify"];
  if (ctx.mode !== "demo" && ctx.admin) {
    const admin = ctx.admin;
    const workspaceId = ctx.workspaceId;
    mailboxVerify = (provider) =>
      verifyOAuthConnection(provider, { workspaceId }, { admin });
  }

  const outcome = await verifyIntegration(params.id, {
    mode: ctx.mode,
    webhookConfigured,
    dispatchTestEvent,
    mailboxVerify,
  });
  if (!outcome) {
    return NextResponse.json(
      { error: `Unknown integration: ${params.id}` },
      { status: 404 }
    );
  }

  // Persist real attempts (live mode only) so the status survives reload.
  let persisted = false;
  if (ctx.mode !== "demo" && outcome.attempted && ctx.admin) {
    try {
      await recordVerification(ctx.admin, ctx.workspaceId, params.id, {
        ok: outcome.ok,
        checkedAt: outcome.checkedAt,
        message: outcome.message,
      });
      persisted = true;
    } catch {
      // Persistence is bookkeeping; the verification result stands.
      persisted = false;
    }
  }

  return NextResponse.json({ ...outcome, persisted });
}
