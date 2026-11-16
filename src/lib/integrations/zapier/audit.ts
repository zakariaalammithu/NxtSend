/**
 * Zapier audit — local recorder writing `zapier.*` actions.
 *
 * Mirrors recordMuseOAuthEvent (src/lib/muse-connector/oauth/audit.ts)
 * but with Zapier actions: every mutating Zapier API call is logged
 * with its workspace_id and an action like `zapier.lead_created` —
 * never mislabelled as `muse.*`. No token, code or secret material
 * is ever written — only ids and the action outcome. Demo mode (or
 * a missing service-role client) logs to the server console instead
 * of failing the request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";

export type ZapierAuditAction =
  | "zapier.lead_created"
  | "zapier.lead_updated"
  | "zapier.leads_imported"
  | "zapier.campaign_created"
  | "zapier.campaign_updated"
  | "zapier.campaign_status_changed"
  | "zapier.leads_enrolled"
  | "zapier.lead_removed_from_campaign"
  | "zapier.reply_sent"
  | "zapier.webhook_subscribed"
  | "zapier.webhook_unsubscribed";

export interface RecordZapierAuditInput {
  workspaceId: string | null;
  actorId: string | null;
  action: ZapierAuditAction;
  /** e.g. `zapier:lead:<id>` — never a token or secret. */
  resource: string;
  details: string;
  admin?: SupabaseClient | null;
}

export async function recordZapierAudit(input: RecordZapierAuditInput): Promise<void> {
  if (getDataMode() === "demo") {
    console.info(`[Zapier audit] ${input.action} ${input.resource} — ${input.details}`);
    return;
  }
  const admin = input.admin !== undefined ? input.admin : createAdminClient();
  if (!admin) {
    console.info(`[Zapier audit] ${input.action} ${input.resource} — ${input.details}`);
    return;
  }
  const { error } = await admin.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    actor_id: input.actorId,
    action: input.action,
    resource: input.resource,
    metadata: {
      details: input.details,
      timestamp: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[Zapier] Audit log write failed:", error.message);
  }
}
