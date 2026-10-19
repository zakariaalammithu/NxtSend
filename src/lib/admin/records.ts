import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUserRecord } from "@/lib/data/admin";
import type { PlanType, UserRole } from "@/types";

/**
 * Loads every profile and shapes it as an AdminUserRecord, joining the
 * per-user workspace count and the plan of the user's first owned
 * workspace (the platform has no separate billing-account entity yet, so
 * the owned workspace's plan is the user's effective tier).
 *
 * MUST be called with a service-role client from a route handler that has
 * already passed requireAdminApi() — the anon client cannot (and must not)
 * list other users' profiles.
 */
export async function loadAdminUserRecords(
  admin: SupabaseClient
): Promise<AdminUserRecord[]> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  const { data: workspaces } = await admin
    .from("workspaces")
    .select("owner_id, plan");

  const counts = new Map<string, number>();
  const plans = new Map<string, PlanType>();
  for (const ws of workspaces ?? []) {
    const ownerId = ws.owner_id as string;
    counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
    if (!plans.has(ownerId)) {
      plans.set(ownerId, ws.plan as PlanType);
    }
  }

  return (profiles ?? []).map((p) => {
    const row = p as Record<string, unknown>;
    const email = String(row.email ?? "");
    return {
      id: String(row.id),
      name: (row.full_name as string) || email.split("@")[0] || "User",
      email,
      role: (row.role as UserRole) ?? "user",
      plan: plans.get(String(row.id)) ?? "free",
      status: row.status === "suspended" ? "suspended" : "active",
      created_at: String(row.created_at ?? new Date().toISOString()),
      workspace_count: counts.get(String(row.id)) ?? 0,
    } satisfies AdminUserRecord;
  });
}
