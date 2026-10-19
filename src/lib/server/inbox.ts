/**
 * Shared request context for the /api/inbox/* route handlers.
 *
 * - Demo mode: there is no session system (by design the whole app runs
 *   on the labelled demo workspace), so the context is the demo
 *   workspace + the demo-backed inbox repository.
 * - Supabase mode: a session is REQUIRED (401 without one), suspended
 *   accounts are refused (403), and the workspace is resolved from the
 *   signed-in user's membership server-side. The repository is bound to
 *   the session client, so RLS enforces tenant isolation on top of the
 *   explicit workspace filter.
 */

import { createServerClient } from "@/lib/supabase/server";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { getInboxRepository, type InboxRepository } from "@/lib/data";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";

export type InboxContext =
  | {
      ok: true;
      mode: DataMode;
      repo: InboxRepository;
      workspaceId: string;
      userId: string | null;
    }
  | { ok: false; status: number; error: string };

export async function resolveInboxContext(): Promise<InboxContext> {
  const mode = getDataMode();

  if (mode === "demo") {
    return {
      ok: true,
      mode,
      repo: getInboxRepository(),
      workspaceId: DEMO_WORKSPACE_ID,
      userId: null,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      error: "Database is not configured, so the inbox is unavailable.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if ((profile?.status as string | undefined) === "suspended") {
    return { ok: false, status: 403, error: "This account is suspended." };
  }

  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return {
      ok: false,
      status: 400,
      error: "No workspace found for this account.",
    };
  }

  return {
    ok: true,
    mode,
    repo: getInboxRepository(supabase),
    workspaceId,
    userId: user.id,
  };
}
