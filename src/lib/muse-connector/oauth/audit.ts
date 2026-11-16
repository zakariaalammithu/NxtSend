/**
 * Muse OAuth audit — local recorder for this module.
 *
 * Worker B owns the shared audit module file, so this module defines
 * its own tiny recorder instead of importing it. It mirrors
 * recordAdminAudit() (src/lib/admin/platform-server.ts) but inserts
 * WITH workspace_id: Muse grants are workspace-scoped, and the
 * audit_logs SELECT policy (migration 021) lets workspace members
 * read their own workspace's rows — platform-only rows (no
 * workspace_id) would be invisible to them.
 *
 * audit_logs shape (migration 001): id, workspace_id, actor_id,
 * action, resource, metadata JSONB, created_at. No token, code or
 * secret material is ever written — only ids, client ids and the
 * action outcome.
 *
 * Demo mode (or a missing service-role client) logs to the server
 * console instead of failing the request — the grant already stands
 * or fell on its own merits; audit bookkeeping must never break it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";

export type MuseOAuthAuditAction =
  | "MUSE_OAUTH_GRANT"
  | "MUSE_OAUTH_DENY"
  | "MUSE_OAUTH_TOKEN_EXCHANGE"
  | "MUSE_OAUTH_TOKEN_REFRESH"
  | "MUSE_OAUTH_TOKEN_REVOKE"
  | "MUSE_OAUTH_GRANT_REVOKED"
  | "MUSE_OAUTH_CLIENT_REGISTER";

export interface RecordMuseOAuthEventInput {
  /** Null for platform-level events with no workspace (e.g. DCR registration). */
  workspaceId: string | null;
  actorId: string | null;
  action: MuseOAuthAuditAction;
  /** e.g. `muse_oauth_client:<client_id>` — never a token or code. */
  resource: string;
  details: string;
  /** Injectable for tests; defaults to the live service-role client. */
  admin?: SupabaseClient | null;
}

export async function recordMuseOAuthEvent(input: RecordMuseOAuthEventInput): Promise<void> {
  if (getDataMode() === "demo") {
    console.info(
      `[Muse OAuth audit] ${input.action} ${input.resource} — ${input.details}`
    );
    return;
  }
  const admin = input.admin !== undefined ? input.admin : createAdminClient();
  if (!admin) {
    console.info(
      `[Muse OAuth audit] ${input.action} ${input.resource} — ${input.details}`
    );
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
    console.error("[Muse OAuth] Audit log write failed:", error.message);
  }
}
