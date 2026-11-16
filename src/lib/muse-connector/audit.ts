/**
 * Muse Connector audit trail.
 *
 * Every MCP tool call writes one entry into `audit_logs` WITH
 * workspace_id, through the service role, so the entries appear in
 * the existing admin Audit Logs page (which reads audit_logs). This
 * mirrors recordAdminAudit (src/lib/admin/platform-server.ts:151) —
 * same table, same service-role insert, same best-effort policy: an
 * audit write failure is logged server-side and never fails the call
 * it records. OAuth grant/revoke entries are written by the OAuth
 * server's own recorder (src/lib/muse-connector/oauth/audit.ts) —
 * the single source of truth for OAuth events, same table and same
 * workspace_id discipline.
 *
 * Demo mode: entries go to the demo audit store (same as
 * recordAdminAudit), so they show up in the demo admin Audit Logs.
 *
 * `audit_logs.workspace_id` exists (migration 001) — no schema change
 * was needed.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { demoAppendAuditEntry } from "@/lib/admin/demo-server-store";
import { getDataMode } from "@/lib/data/mode";

export interface MuseAuditInput {
  workspaceId: string;
  /** Grant user id (subject). May be null for OAuth events without a user yet. */
  userId: string | null;
  /** e.g. "muse.tool.list_leads", "muse.oauth.grant". */
  action: string;
  /** Short resource label, e.g. a lead/campaign id or the tool name. */
  resource?: string;
  /** Plain-language outcome detail. Never include secrets, tokens or message bodies. */
  details: string;
}

export async function recordMuseAudit(input: MuseAuditInput): Promise<void> {
  const mode = getDataMode();
  const action = input.action.startsWith("muse.") ? input.action : `muse.${input.action}`;
  if (mode === "demo") {
    demoAppendAuditEntry({
      actor: input.userId ?? "muse-connector",
      action,
      resource: input.resource ?? "muse-connector",
      details: input.details,
    });
    return;
  }
  const admin = createAdminClient();
  if (!admin) {
    console.error("[Muse] Audit log write skipped: service role is not configured.");
    return;
  }
  const { error } = await admin.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    actor_id: input.userId,
    action,
    resource: input.resource ?? "muse-connector",
    metadata: {
      actor_email: null,
      details: input.details,
      source: "muse-connector",
      timestamp: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[Muse] Audit log write failed:", error.message);
  }
}
