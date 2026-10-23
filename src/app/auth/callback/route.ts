import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/auth/workspace";
import {
  mapProviderOAuthError,
  sanitizeRedirectTarget,
} from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /auth/callback — the app-side landing for Supabase Auth OAuth
 * (Google Sign-In; see src/lib/auth/oauth.ts and SETUP.md §3).
 *
 * Supabase's auth server completes the Google exchange itself and
 * redirects here with either:
 *
 *   ?code=<app code>            → exchange it for a session
 *                                 (exchangeCodeForSession, PKCE),
 *   ?error=<provider error>     → the user cancelled or the provider
 *                                 refused; mapped to a SAFE app error
 *                                 code — raw provider text is never
 *                                 reflected into the login page,
 *   ?redirect=<target>          → our own parameter, added when the
 *                                 flow started; sanitised before use.
 *
 * Outcomes:
 *   provider error        → /login?error=oauth_cancelled|oauth_failed
 *   no code / no client   → /login?error=oauth_failed (in Demo Mode
 *                           there is no session to exchange — NEVER a
 *                           bounce into the dashboard)
 *   exchange failure      → /login?error=oauth_failed
 *   suspended profile     → signed straight back out, then
 *                           /login?error=account_suspended (mirrors
 *                           the password-login behaviour in LoginForm)
 *   success               → default workspace ensured (idempotent,
 *                           non-fatal), redirect to the sanitised
 *                           target (default /dashboard)
 *
 * This route is deliberately NOT in middleware's AUTH_ROUTES and is
 * not a protected prefix: it must run for users who do not have a
 * session yet.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const target = sanitizeRedirectTarget(searchParams.get("redirect"));

  const loginWithError = (code: string) =>
    NextResponse.redirect(new URL(`/login?error=${code}`, origin));

  // (a) Provider-side failure or cancellation.
  const providerError = searchParams.get("error");
  if (providerError) {
    return loginWithError(mapProviderOAuthError(providerError));
  }

  // (d) Neither code nor error — nothing to exchange.
  const code = searchParams.get("code");
  if (!code) {
    return loginWithError("oauth_failed");
  }

  const supabase = await createServerClient();
  if (!supabase) {
    // Demo Mode / Supabase not configured: no session can be created.
    return loginWithError("oauth_failed");
  }

  // (b) Exchange the code for a session (sets the session cookies on
  // the redirect response via the SSR cookie store).
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return loginWithError("oauth_failed");
  }

  const user = data?.user ?? (await supabase.auth.getUser()).data.user;
  if (!user) {
    return loginWithError("oauth_failed");
  }

  // (c) Suspension enforcement — mirrors password login: a suspended
  // profile must not keep the session the exchange just created.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return loginWithError("account_suspended");
  }

  // First authenticated landing: OAuth users never pass through
  // LoginForm, so the default-workspace guarantee is applied here.
  // Idempotent and non-fatal (see src/lib/auth/workspace.ts).
  // full_name is used ONLY as a workspace display label.
  await ensureDefaultWorkspace(
    supabase,
    user.id,
    (user.user_metadata?.full_name as string) ?? null
  );

  return NextResponse.redirect(new URL(target, origin));
}
