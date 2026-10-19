import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/server-auth";
import { loadAdminUserRecords } from "@/lib/admin/records";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 *
 * Lists all platform users for the admin console. The caller's admin role
 * is verified server-side from their profiles row (requireAdminApi) before
 * the service-role client reads anything — the browser alone can never
 * list other users' profiles under RLS.
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
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[Admin] Failed to load users:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
