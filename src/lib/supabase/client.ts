import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates and returns a Supabase browser-side client instance.
 *
 * If environment variables NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are missing or set to placeholder values, this returns `null` and logs a warning,
 * signaling that the client-side UI should run in demo mode.
 *
 * @returns An initialized SupabaseClient instance, or null if demo mode is active.
 */
export function createClient(): SupabaseClient | null {
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
    if (typeof window !== "undefined") {
      console.warn(
        "[NxtSend] Supabase client: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or placeholder. Running in demo mode."
      );
    }
    return null;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
