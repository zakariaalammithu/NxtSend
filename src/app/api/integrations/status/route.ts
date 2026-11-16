import { NextResponse } from "next/server";
import { getIntegrationStatuses } from "@/lib/integrations-center/status";
import { readVerificationRecords } from "@/lib/integrations-center/verification-store";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { getWorkspaceWebhookConfig } from "@/lib/webhooks/store";
import {
  createSupabaseOAuthStore,
  summariseOAuthMailboxes,
  type OAuthMailboxSummary,
} from "@/lib/oauth/store";
import { countActiveMuseGrants, countActiveGrantsByOrigin } from "@/lib/muse-connector/grants";
import type { OAuthProvider } from "@/lib/oauth/types";

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
  let museGrantsActive: number | null = null;
  let chatgptGrantsActive: number | null = null;
  let claudeGrantsActive: number | null = null;
  let oauthMailboxes:
    | Partial<Record<OAuthProvider, OAuthMailboxSummary | null>>
    | undefined;

  if (ctx.mode !== "demo" && ctx.admin) {
    verifications = await readVerificationRecords(ctx.admin, ctx.workspaceId);
    const config = await getWorkspaceWebhookConfig(ctx.admin, ctx.workspaceId);
    webhookConfigured = Boolean(config && config.enabled);
    // Active OAuth grants for this workspace (metadata only — the
    // count queries select no token material). null when the
    // migration 023 tables cannot be read; the statuses then fall
    // back to the env-derived state. The Muse count keeps its
    // existing query (all live grants, workspace-filtered); the
    // ChatGPT and Claude counts come from the by-origin split of
    // the same live refresh tokens.
    museGrantsActive = await countActiveMuseGrants(ctx.admin, {
      workspaceId: ctx.workspaceId,
    });
    const byOrigin = await countActiveGrantsByOrigin(ctx.admin, {
      workspaceId: ctx.workspaceId,
    });
    chatgptGrantsActive = byOrigin ? byOrigin.chatgpt : null;
    claudeGrantsActive = byOrigin ? byOrigin.claude : null;
    try {
      const store = createSupabaseOAuthStore(ctx.admin);
      const views = await store.listConnectionViews(ctx.workspaceId);
      oauthMailboxes = summariseOAuthMailboxes(views);
    } catch {
      // oauth_connections may not exist yet (migration 014 not
      // applied): the entries fall back to env-derived states.
      oauthMailboxes = undefined;
    }
  }

  const integrations = getIntegrationStatuses({
    verifications,
    webhookConfigured,
    oauthMailboxes,
    museGrantsActive,
    chatgptGrantsActive,
    claudeGrantsActive,
  });

  return NextResponse.json({ mode: ctx.mode, integrations });
}
