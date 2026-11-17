/**
 * Zapier audit — local recorder writing `zapier.*` actions.
 *
 * Thin wrapper over the shared recorder
 * (src/lib/integrations/rest/audit.ts): the bare action
 * (`lead_created`) is prefixed with `zapier` there. No token,
 * code or secret material is ever written — only ids and the
 * action outcome.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPlatformAudit } from "@/lib/integrations/rest/audit";

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
  return recordPlatformAudit({
    platform: "zapier",
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action.replace(/^zapier\./, ""),
    resource: input.resource,
    details: input.details,
    admin: input.admin,
  });
}
