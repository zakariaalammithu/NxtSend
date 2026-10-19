"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

/**
 * Checks whether the application is running in unconfigured demo mode.
 *
 * @returns True if NEXT_PUBLIC_SUPABASE_URL is missing or equals placeholder.
 */
export function isDemo(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    !url ||
    !key ||
    url === "https://your-project.supabase.co" ||
    url.includes("placeholder") ||
    key === "your-anon-key" ||
    key.includes("placeholder")
  );
}

/**
 * Fallback profile used when running in demo mode without Supabase connection.
 *
 * SECURITY: the demo profile is a plain "user", never an admin. The admin
 * console is additionally gated in middleware while in demo mode.
 */
const DEMO_USER_PROFILE: Profile = {
  id: "demo-user-001",
  email: "alex@nxtsend.com",
  full_name: "Alex Vance",
  avatar_url: null,
  role: "user",
  created_at: "2024-01-01T00:00:00.000Z",
};

/**
 * Retrieves the currently authenticated user's profile from the server session.
 * In demo mode, returns a mock active profile.
 *
 * @returns Promise resolving to Profile or null if unauthenticated.
 */
export async function getCurrentUser(): Promise<Profile | null> {
  if (isDemo()) {
    return DEMO_USER_PROFILE;
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, status, created_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    // SECURITY: role comes ONLY from the profiles row. Never fall back to
    // the auth user's metadata — it is writable by the user themselves via
    // the client SDK, so trusting it here was a privilege-escalation path
    // (SAAS_AUDIT F3). The profile row is auto-created by the
    // handle_new_user() trigger, so a missing row is an edge case:
    // default to least privilege.
    return {
      id: user.id,
      email: user.email ?? "",
      full_name: null,
      avatar_url: null,
      role: "user",
      created_at: user.created_at,
    };
  }

  return profile as Profile;
}

/**
 * Enforces that the current request has an authenticated session.
 * Throws a Next.js redirect to '/login' if not authenticated.
 *
 * @returns Promise resolving to the authenticated Profile.
 */
export async function requireAuth(): Promise<Profile> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Enforces that the authenticated user possesses one of the allowed roles.
 * Redirects to '/' if the user lacks the required permission.
 *
 * @param role - Required UserRole or list of accepted UserRole values.
 * @returns Promise resolving to the authorized Profile.
 */
export async function requireRole(
  role: UserRole | UserRole[]
): Promise<Profile> {
  const user = await requireAuth();
  const allowedRoles = Array.isArray(role) ? role : [role];

  if (!allowedRoles.includes(user.role)) {
    redirect("/");
  }

  return user;
}
