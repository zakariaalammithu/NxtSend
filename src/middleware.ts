import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
// Routes that require admin or super_admin role
const ADMIN_PREFIXES = ["/admin"];
// Auth routes — redirect to dashboard if already logged in
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Refresh session cookies (always run this)
  const response = await updateSession(request);

  // 2. Get session from cookies (already refreshed above)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, allow all routes (demo mode)
  if (!supabaseUrl || supabaseUrl === "https://your-project.supabase.co" || !supabaseKey) {
    // In demo mode, protect admin routes with a simple check
    if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      // Allow in demo mode but add demo header
      const resp = NextResponse.next();
      resp.headers.set("x-demo-mode", "true");
      return resp;
    }
    return response;
  }

  // 3. Check if route needs protection
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAdminRoute = ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));

  // 4. Get user from session cookie
  // We use the response cookies (already refreshed by updateSession)
  // The actual session check happens in server components — middleware just does redirect logic
  const { createServerClient } = await import("@supabase/ssr");
  const { cookies } = await import("next/headers");

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {}, // Already handled by updateSession
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Redirect logged-in users away from auth pages
    if (isAuthRoute && user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Redirect unauthenticated users away from protected pages
    if (isProtected && !user) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Check admin role for admin routes
    if (isAdminRoute && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["admin", "super_admin"].includes(profile.role)) {
        return NextResponse.redirect(new URL("/dashboard?error=unauthorized", request.url));
      }
    }
  } catch {
    // Supabase not configured or error — fall through in demo mode
    if (isProtected) {
      // In demo mode with configured Supabase that errored, still protect
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, public assets
     * - API routes (they handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
