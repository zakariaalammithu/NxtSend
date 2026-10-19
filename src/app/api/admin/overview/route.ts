import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/server-auth";
import { loadAdminUserRecords } from "@/lib/admin/records";
import { createAdminClient } from "@/lib/supabase/server";
import type { AdminOverview } from "@/lib/data/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/overview
 *
 * Platform aggregates for the admin overview page, computed from real
 * tables (profiles / workspaces / subscriptions) after the caller's admin
 * role has been verified server-side.
 */
export async function GET() {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const users = await loadAdminUserRecords(admin);

    const { count: workspaceCount } = await admin
      .from("workspaces")
      .select("id", { count: "exact", head: true });

    const { data: subscriptions } = await admin
      .from("subscriptions")
      .select("status");

    const overview: AdminOverview = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      suspendedUsers: users.filter((u) => u.status === "suspended").length,
      totalWorkspaces: workspaceCount ?? 0,
      totalSubscriptions: subscriptions?.length ?? 0,
      activeSubscriptions: (subscriptions ?? []).filter(
        (s) => (s as Record<string, unknown>).status === "active"
      ).length,
      recentUsers: users.slice(0, 5),
    };

    return NextResponse.json(overview);
  } catch (err) {
    console.error("[Admin] Failed to load overview:", err);
    return NextResponse.json(
      { error: "Failed to load overview" },
      { status: 500 }
    );
  }
}
