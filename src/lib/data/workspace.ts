import { createClient } from "@/lib/supabase/client";
import { getDataMode } from "./mode";

/** The single workspace that exists in demo mode (matches the mock data). */
export const DEMO_WORKSPACE_ID = "ws_demo_001";
/** The demo persona's user id (matches the mock data). */
export const DEMO_USER_ID = "usr_demo_001";

/**
 * Resolves the workspace the signed-in user is working in.
 *
 * - Demo mode: always the demo workspace.
 * - Supabase mode: the user's first workspace membership, falling back to
 *   the first workspace they own. All repository queries are additionally
 *   scoped by this id and enforced server-side by RLS, so a wrong id can
 *   only ever produce empty results, never another tenant's data.
 *
 * Returns null in Supabase mode when there is no session or no workspace
 * yet (pages should render their empty state in that case).
 */
export async function resolveWorkspaceId(): Promise<string | null> {
  if (getDataMode() === "demo") {
    return DEMO_WORKSPACE_ID;
  }

  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (member?.workspace_id) {
    return member.workspace_id as string;
  }

  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}
