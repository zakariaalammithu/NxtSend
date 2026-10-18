import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes user auth tokens and synchronizes session cookies in Next.js Middleware.
 *
 * @param request - Incoming NextRequest instance.
 * @returns NextResponse with refreshed cookies or pass-through response in demo mode.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh auth token by fetching the current user session
  await supabase.auth.getUser();

  return response;
}
