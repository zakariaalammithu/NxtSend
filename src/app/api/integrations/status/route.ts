import { NextResponse } from "next/server";
import { getIntegrationStatuses } from "@/lib/integrations-center/status";
import { readVerificationRecords } from "@/lib/integrations-center/verification-store";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { getWorkspaceWebhookConfig } from "@/lib/webhooks/store";

/**
 * GET /api/integrations/status
 *
 * The Integration Center's data source: every registered integration
 * with its derived honest status, env-var presence booleans (NEVER
 * values), and the stored last-verification record.
 *
 * Demo mode: returns the demo states (no session exists by design).
 * Live mode: a session is required (401 without one); verification
 * records and the workspace's webhook subscription are read server-side
 * through the service role.
 */
export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  let verifications: Record<string, import("@/lib/integrations-center/types").VerificationRecord> = {};
  let webhookConfigured: boolean | null = null;

  if (ctx.mode !== "demo" && ctx.admin) {
    verifications = await readVerificationRecords(ctx.admin, ctx.workspaceId);
    const config = await getWorkspaceWebhookConfig(ctx.admin, ctx.workspaceId);
    webhookConfigured = Boolean(config && config.enabled);
  }

  const integrations = getIntegrationStatuses({
    verifications,
    webhookConfigured,
  });

  return NextResponse.json({ mode: ctx.mode, integrations });
}
