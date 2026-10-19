/**
 * Shared server helpers for /api/webhooks/* routes: caller resolution
 * and the Demo Mode in-memory subscription (per-process, labelled).
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import type { WebhookConfig } from "./config";

export type WebhookCaller =
  | { mode: "demo"; workspaceId: string }
  | {
      mode: "live";
      supabase: SupabaseClient;
      userId: string;
      workspaceId: string;
      /** workspace_members role: owner | admin | member */
      role: string;
    };

export async function resolveWebhookCaller(): Promise<
  { caller: WebhookCaller } | { response: NextResponse }
> {
  if (getDataMode() === "demo") {
    return { caller: { mode: "demo", workspaceId: DEMO_WORKSPACE_ID } };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return {
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
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return {
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
    caller: {
      mode: "live",
      supabase,
      userId: user.id,
      workspaceId,
      role: (membership?.role as string | undefined) ?? "member",
    },
  };
}

export function isWorkspaceAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

// ── Demo-mode in-memory subscription (per server process) ───────────────────

let demoConfig: WebhookConfig | null = null;

export function getDemoWebhookConfig(): WebhookConfig | null {
  return demoConfig;
}

export function setDemoWebhookConfig(config: WebhookConfig | null): void {
  demoConfig = config;
}
