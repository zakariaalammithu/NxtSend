import { NextRequest, NextResponse } from "next/server";

/**
 * Admin Bootstrap Endpoint
 *
 * Promotes nxtsendai@gmail.com to super_admin role.
 * Protected by ADMIN_BOOTSTRAP_SECRET env var.
 * Should be called ONCE after initial deployment, then the secret should
 * be removed from environment variables.
 *
 * Usage:
 *   curl -X POST https://your-domain.com/api/admin/bootstrap \
 *     -H "Content-Type: application/json" \
 *     -d '{"secret": "your-bootstrap-secret", "email": "nxtsendai@gmail.com"}'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret, email } = body as { secret?: string; email?: string };

    // 1. Validate secret exists and matches
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!bootstrapSecret || bootstrapSecret === "change-me-to-a-random-64-character-string-before-use") {
      return NextResponse.json(
        { error: "Bootstrap is not configured. Set ADMIN_BOOTSTRAP_SECRET in your environment." },
        { status: 403 }
      );
    }

    if (!secret || secret !== bootstrapSecret) {
      // Log the attempt without revealing details
      console.warn("[Bootstrap] Unauthorized bootstrap attempt from:", request.headers.get("x-forwarded-for") || "unknown");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate email
    const targetEmail = email || "nxtsendai@gmail.com";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // 3. Check Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey ||
        supabaseUrl === "https://your-project.supabase.co" ||
        serviceRoleKey === "your-service-role-key-here") {
      return NextResponse.json(
        { error: "Supabase is not configured. Bootstrap cannot run in demo mode." },
        { status: 503 }
      );
    }

    // 4. Use service role to bypass RLS and set role
    // NOTE: createClient is imported dynamically to ensure this never runs client-side
    const { createClient } = await import("@supabase/supabase-js");
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Check if user exists in auth
    const { data: userList, error: userError } = await adminSupabase.auth.admin.listUsers();
    if (userError) {
      return NextResponse.json({ error: "Failed to query users" }, { status: 500 });
    }

    const authUser = userList.users.find((u) => u.email === targetEmail);
    if (!authUser) {
      return NextResponse.json(
        { error: `No user found with email ${targetEmail}. They must sign up first.` },
        { status: 404 }
      );
    }

    // 5. Update profile role
    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({ role: "super_admin", updated_at: new Date().toISOString() })
      .eq("id", authUser.id);

    if (updateError) {
      console.error("[Bootstrap] Update failed:", updateError);
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    // 6. Log audit entry
    await adminSupabase.from("audit_logs").insert({
      actor_id: authUser.id,
      action: "ADMIN_BOOTSTRAP",
      resource: "profiles",
      metadata: {
        email: targetEmail,
        role_granted: "super_admin",
        timestamp: new Date().toISOString(),
      },
    });

    console.info(`[Bootstrap] Successfully promoted ${targetEmail} to super_admin.`);
    console.warn("[Bootstrap] IMPORTANT: Remove ADMIN_BOOTSTRAP_SECRET from your environment now!");

    return NextResponse.json({
      success: true,
      message: `Successfully promoted ${targetEmail} to super_admin.`,
      action_required: "Remove ADMIN_BOOTSTRAP_SECRET from your environment variables immediately to prevent re-use.",
    });
  } catch (error) {
    console.error("[Bootstrap] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Block all other methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
