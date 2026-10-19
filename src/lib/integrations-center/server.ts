/**
 * Shared request context for /api/integrations/* route handlers.
 *
 * Mirrors the established patterns (src/lib/server/inbox.ts,
 * src/lib/webhooks/server.ts):
 *  - Demo mode: no session system exists by design; the context is the
 *    labelled demo workspace and verification results stay session-level.
 *  - Live mode: a session is REQUIRED (401), suspended accounts are
 *    refused (403), the workspace is resolved from membership
 *    server-side, and the caller's workspace role is returned so the
 *    verify route can require owner/admin (verification makes outbound
 *    calls with workspace credentials and writes the record — a
 *    mutation-class action, like the webhooks config API).
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";

export type CenterContext =
  | {
      ok: true;
      mode: DataMode;
      workspaceId: string;
      userId: string | null;
      /** workspace_members role in live mode (owner | admin | member); null in demo. */
      workspaceRole: string | null;
      supabase: SupabaseClient | null;
      admin: SupabaseClient | null;
    }
  | { ok: false; response: NextResponse };

export async function resolveCenterContext(): Promise<CenterContext> {
  const mode = getDataMode();

  if (mode === "demo") {
    return {
      ok: true,
      mode,
      workspaceId: DEMO_WORKSPACE_ID,
      userId: null,
      workspaceRole: null,
      supabase: null,
      admin: null,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Supabase is not configured (demo mode)." },
        { status: 503 }
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if ((profile?.status as string | undefined) === "suspended") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: this account is suspended." },
        { status: 403 }
      ),
    };
  }

  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No workspace found for this account." },
        { status: 400 }
      ),
    };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    ok: true,
    mode,
    workspaceId,
    userId: user.id,
    workspaceRole: (membership?.role as string | undefined) ?? "member",
    supabase,
    admin: createAdminClient(),
  };
}

export function isWorkspaceAdminRole(role: string | null): boolean {
  return role === "owner" || role === "admin";
}
