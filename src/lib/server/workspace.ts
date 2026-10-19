/**
 * Server-side workspace resolution for route handlers.
 *
 * Mirrors src/lib/data/workspace.ts semantics (first membership, then
 * first owned workspace) but takes the caller's SESSION client (from
 * src/lib/supabase/server) instead of the browser client, so API routes
 * resolve the workspace as the signed-in user — RLS still applies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveServerWorkspaceId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (member?.workspace_id) {
    return member.workspace_id as string;
  }

  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}
