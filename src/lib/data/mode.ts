/**
 * Data-layer mode selection.
 *
 * The whole data layer (src/lib/data) runs against one of two backends:
 *  - "supabase": a real Supabase project is configured via env vars; all
 *    reads/writes go through the database, scoped by workspace and enforced
 *    by Row Level Security.
 *  - "demo": no (or placeholder) Supabase configuration; repositories serve
 *    the bundled mock dataset through a browser-local demo store. Demo data
 *    must always be labelled as demo in the UI.
 *
 * The placeholder detection here intentionally matches the checks already
 * used by src/lib/supabase/client.ts, src/lib/supabase/server.ts and
 * src/lib/auth/helpers.ts (isDemo), so the data layer can never disagree
 * with the auth layer about which mode the app is in.
 */

export type DataMode = "demo" | "supabase";

export interface SupabaseEnvLike {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

function envFromProcess(): SupabaseEnvLike {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * True only when both the Supabase URL and anon key are present and are not
 * the documented placeholder values from .env.example.
 */
export function isSupabaseConfigured(env: SupabaseEnvLike): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return false;
  if (url === "https://your-project.supabase.co" || url.includes("placeholder")) {
    return false;
  }
  if (key === "your-anon-key" || key.includes("placeholder")) {
    return false;
  }
  return true;
}

/**
 * Decides which backend the data layer uses. Accepts an explicit env object
 * (used by unit tests); defaults to the process environment.
 */
export function getDataMode(env?: SupabaseEnvLike): DataMode {
  return isSupabaseConfigured(env ?? envFromProcess()) ? "supabase" : "demo";
}
