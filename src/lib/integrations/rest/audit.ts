/**
 * Shared REST audit — local recorder writing `<prefix>.*` actions.
 *
 * Mirrors recordZapierAudit (src/lib/integrations/zapier/audit.ts)
 * but platform-parameterised: every mutating REST API call is
 * logged with its workspace_id and an action like
 * `n8n.lead_created` — never mislabelled as `muse.*` or as
 * another platform's. No token, code or secret material is ever
 * written — only ids and the action outcome. Demo mode (or a
 * missing service-role client) logs to the server console instead
 * of failing the request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { getPlatformConfig, type RestPlatform } from "./config";

export interface RecordPlatformAuditInput {
  platform: RestPlatform;
  workspaceId: string | null;
  actorId: string | null;
  /** Action suffix, e.g. "lead_created" → `n8n.lead_created`. */
  action: string;
  /** e.g. `n8n:lead:<id>` — never a token or secret. */
  resource: string;
  details: string;
  admin?: SupabaseClient | null;
}

export async function recordPlatformAudit(input: RecordPlatformAuditInput): Promise<void> {
  const prefix = getPlatformConfig(input.platform).auditPrefix;
  const action = `${prefix}.${input.action}`;
  if (getDataMode() === "demo") {
    console.info(`[${prefix} audit] ${action} ${input.resource} — ${input.details}`);
    return;
  }
  const admin = input.admin !== undefined ? input.admin : createAdminClient();
  if (!admin) {
    console.info(`[${prefix} audit] ${action} ${input.resource} — ${input.details}`);
    return;
  }
  const { error } = await admin.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    actor_id: input.actorId,
    action,
    resource: input.resource,
    metadata: {
      details: input.details,
      timestamp: new Date().toISOString(),
    },
  });
  if (error) {
    console.error(`[${prefix}] Audit log write failed:`, error.message);
  }
}
