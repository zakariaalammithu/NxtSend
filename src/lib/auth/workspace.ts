import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures the given user owns a workspace, creating a default one if not.
 *
 * Why this exists: at signup time a workspace insert can legitimately fail or
 * be impossible — most importantly when the Supabase project requires email
 * confirmation, because signUp() then returns a user with NO session, and the
 * anon client cannot satisfy the workspaces RLS insert policy
 * (owner_id = auth.uid()). The previous code ignored the insert error and
 * navigated to /dashboard anyway, leaving confirmed users workspaceless.
 *
 * Strategy: attempt the insert at signup ONLY when a session exists, and
 * re-run this check on the first authenticated sign-in (LoginForm), where a
 * session is guaranteed. Errors are logged, never thrown — a missing
 * workspace must not lock a user out of signing in; the next sign-in retries.
 *
 * @param supabase - Authenticated browser Supabase client.
 * @param userId - The authenticated user's id (becomes workspaces.owner_id).
 * @param fullName - Optional display name used for the "<Name>'s Workspace"
 *   label only. Never used for any authorization decision.
 */
export async function ensureDefaultWorkspace(
  supabase: SupabaseClient,
  userId: string,
  fullName?: string | null
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);

  if (selectError) {
    console.error(
      "[NxtSend] Could not check for an existing workspace:",
      selectError.message
    );
    return;
  }

  if (existing && existing.length > 0) {
    return;
  }

  const workspaceName = fullName ? `${fullName}'s Workspace` : "My Workspace";

  const { error: insertError } = await supabase.from("workspaces").insert({
    name: workspaceName,
    owner_id: userId,
    plan: "free",
  });

  if (insertError) {
    console.error(
      "[NxtSend] Failed to create default workspace:",
      insertError.message
    );
  }
}
