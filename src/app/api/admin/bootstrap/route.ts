import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Constant-time secret comparison. Both values are hashed first so the
 * comparison never leaks the secret's length and timingSafeEqual always
 * receives equal-length buffers.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Simple in-memory rate limit for bootstrap attempts: at most
 * RATE_LIMIT_MAX attempts per source IP per window. This is per-process
 * memory (on serverless it resets with the instance and is not shared
 * across instances) — it raises the cost of online guessing; the real
 * protection remains removing ADMIN_BOOTSTRAP_SECRET after first use.
 */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const bootstrapAttempts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const entry = bootstrapAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    bootstrapAttempts.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordAttempt(ip: string): void {
  const now = Date.now();
  const entry = bootstrapAttempts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    bootstrapAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

/**
 * Admin Bootstrap Endpoint
 *
 * Promotes an EXISTING signed-up account to the super_admin role.
 * Protected by ADMIN_BOOTSTRAP_SECRET env var — the secret is the
 * capability; the email in the request only SELECTS which existing
 * account to promote and grants nothing by itself (there is no
 * email-based shortcut anywhere in this route).
 * Should be called ONCE after initial deployment, then the secret should
 * be removed from environment variables.
 *
 * The owner's own admin account is mithusquare@gmail.com (the default
 * below, used when the body omits `email`) — the owner signs up with
 * that address first, then runs this once (SETUP.md §5).
 *
 * Usage:
 *   curl -X POST https://your-domain.com/api/admin/bootstrap \
 *     -H "Content-Type: application/json" \
 *     -d '{"secret": "your-bootstrap-secret", "email": "mithusquare@gmail.com"}'
 */
export async function POST(request: NextRequest) {
  try {
    // 0. Rate limit (counts every attempt, before any secret handling)
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: "Too many bootstrap attempts. Try again later." },
        { status: 429 }
      );
    }
    recordAttempt(clientIp);

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

    if (!secret || !secretsMatch(secret, bootstrapSecret)) {
      // Log the attempt without revealing details
      console.warn("[Bootstrap] Unauthorized bootstrap attempt from:", request.headers.get("x-forwarded-for") || "unknown");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate email. The default is the owner's signup address
    // (mithusquare@gmail.com); an explicit `email` in the body selects a
    // different EXISTING account. Either way the email only selects the
    // account — promotion requires the bootstrap secret above.
    const targetEmail = email || "mithusquare@gmail.com";
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
