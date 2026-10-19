import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

/**
 * Server-side admin gate for /api/admin/* route handlers.
 *
 * The caller's role is read from the `profiles` row via the caller's own
 * session (RLS-scoped) — never from request bodies, headers, or auth user
 * metadata (which users can edit themselves; see SAAS_AUDIT F3). Only
 * profiles with role admin/super_admin pass.
 *
 * Returns either { profile } on success or { response } — a ready-made
 * NextResponse the handler should return immediately:
 *  - 503 when Supabase is not configured (demo mode: admin mutations are
 *    served by the client-side demo store instead, and are labelled demo)
 *  - 401 when there is no authenticated session
 *  - 403 when the profile is missing or not an admin
 */

export interface AdminCaller {
  id: string;
  email: string;
  role: UserRole;
  status: "active" | "suspended";
}

export async function requireAdminApi(): Promise<
  { caller: AdminCaller } | { response: NextResponse }
> {
  const supabase = await createServerClient();
  if (!supabase) {
    return {
      response: NextResponse.json(
        {
          error:
            "Supabase is not configured (demo mode). Admin API is unavailable; demo mutations are handled by the labelled demo store.",
        },
        { status: 503 }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (profile.role !== "admin" && profile.role !== "super_admin") {
    return {
      response: NextResponse.json(
        { error: "Forbidden: admin role required" },
        { status: 403 }
      ),
    };
  }

  if (profile.status === "suspended") {
    return {
      response: NextResponse.json(
        { error: "Forbidden: this admin account is suspended" },
        { status: 403 }
      ),
    };
  }

  return {
    caller: {
      id: profile.id as string,
      email: profile.email as string,
      role: profile.role as UserRole,
      status: (profile.status as "active" | "suspended") ?? "active",
    },
  };
}
