import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/server-auth";
import { loadAdminUserRecords } from "@/lib/admin/records";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/status  { userId, status: "active" | "suspended" }
 *
 * The reference admin mutation. Enforcement chain:
 *  1. requireAdminApi() verifies the caller's profile role server-side
 *     (admin/super_admin, from the profiles row — never from the request).
 *  2. An admin cannot suspend themselves, and only a super_admin can
 *     change a super_admin's status.
 *  3. The update runs through the service-role client (profiles.status is
 *     not client-writable — migration 002 revokes it and guards it with a
 *     trigger), and an audit_logs entry is written for the action.
 *
 * Suspension takes effect at the target's next sign-in (LoginForm checks
 * profiles.status and refuses suspended accounts) and immediately for any
 * /api/admin/* call they might make.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;
  const { caller } = gate;

  let body: { userId?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId;
  const status = body.status;
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (status !== "active" && status !== "suspended") {
    return NextResponse.json(
      { error: 'status must be "active" or "suspended"' },
      { status: 400 }
    );
  }
  if (userId === caller.id && status === "suspended") {
    return NextResponse.json(
      { error: "You cannot suspend your own account" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  // Load the target first: existence check + super_admin protection.
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "super_admin" && caller.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only a super_admin can change a super_admin's status" },
      { status: 403 }
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) {
    console.error("[Admin] Status update failed:", updateError);
    return NextResponse.json(
      { error: "Failed to update user status" },
      { status: 500 }
    );
  }

  // Audit trail (service-role insert — the only client of audit_logs
  // besides the bootstrap route). Best-effort: the mutation has committed,
  // so a failed audit write is logged loudly server-side rather than
  // failing the request after the fact.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: caller.id,
    action: status === "suspended" ? "USER_SUSPEND" : "USER_ACTIVATE",
    resource: `user:${userId}`,
    metadata: {
      email: target.email,
      status,
      actor_email: caller.email,
      timestamp: new Date().toISOString(),
    },
  });
  if (auditError) {
    console.error("[Admin] Audit log write failed:", auditError);
  }

  const users = await loadAdminUserRecords(admin);
  const updated = users.find((u) => u.id === userId);
  return NextResponse.json({ user: updated ?? null });
}

// Block other methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
