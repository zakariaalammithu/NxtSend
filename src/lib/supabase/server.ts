import {
  createServerClient as createSupabaseServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates and returns a server-side Supabase client with cookie access.
 * Reads cookies from next/headers to maintain session state across requests.
 *
 * Returns null if Supabase credentials are unset or placeholder (Demo Mode).
 *
 * @returns Promise resolving to a SupabaseClient instance, or null if in demo mode.
 */
export async function createServerClient(): Promise<SupabaseClient | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isInvalidUrl =
    !supabaseUrl ||
    supabaseUrl === "https://your-project.supabase.co" ||
    supabaseUrl.includes("placeholder");

  const isInvalidKey =
    !supabaseAnonKey ||
    supabaseAnonKey === "your-anon-key" ||
    supabaseAnonKey.includes("placeholder");

  if (isInvalidUrl || isInvalidKey) {
    return null;
  }

  const cookieStore = cookies();

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if middleware is refreshing user sessions.
        }
      },
    },
  });
}

/**
 * Creates a privileged Supabase administrative client using SUPABASE_SERVICE_ROLE_KEY.
 *
 * SECURITY: Bypasses Row Level Security (RLS). Must ONLY be executed in trusted
 * server contexts (server actions, Route Handlers). NEVER use in 'use client' files.
 *
 * @returns SupabaseClient configured with service role privileges, or null if unconfigured.
 */
export function createAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isInvalidUrl =
    !supabaseUrl ||
    supabaseUrl === "https://your-project.supabase.co" ||
    supabaseUrl.includes("placeholder");

  const isInvalidKey =
    !serviceRoleKey ||
    serviceRoleKey === "your-service-role-key" ||
    serviceRoleKey.includes("placeholder");

  if (isInvalidUrl || isInvalidKey) {
    return null;
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
