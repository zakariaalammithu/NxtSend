/**
 * OAuth (Google Sign-In) — shared helpers.
 *
 * The app uses Supabase Auth's Google provider with the
 * authorization-code + PKCE flow that @supabase/ssr implements:
 *
 *   1. The browser client calls `signInWithOAuth({ provider:
 *      "google", options: { redirectTo } })` (see
 *      components/auth/ContinueWithGoogleButton.tsx). Supabase owns
 *      the `state`/PKCE/nonce mechanics — the app never hand-rolls
 *      them and never sees Google's tokens.
 *   2. Supabase redirects back to `<origin>/auth/callback`, which
 *      exchanges the app-level `code` for a session
 *      (src/app/auth/callback/route.ts) and lands the user on the
 *      post-login target carried through the flow.
 *
 * The Google client ID/secret for this flow live in the Supabase
 * dashboard (Authentication → Providers → Google) — they are a
 * SEPARATE OAuth client from the Gmail mailbox client in
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and never appear in app
 * env or client code. See SETUP.md §3 ("Google Sign-In setup").
 *
 * This module is pure (no I/O, no env reads) so the redirect
 * sanitiser and the provider-error mapping are unit-tested and can be
 * imported from both server route handlers and client components.
 */

/** Where users land after sign-in when no target was requested. */
export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

/**
 * Paths a post-login target may never point back at: landing on an
 * auth page (or the callback itself) straight after a successful
 * sign-in would loop or strand the user.
 */
const AUTH_LOOP_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
]);

/**
 * Sanitises the post-login `redirect` target that middleware emits
 * (`/login?redirect=<pathname>`) and the auth pages + OAuth callback
 * consume. ONE canonical parameter name — `redirect` — is used by the
 * middleware, the password forms, the Google start, and the callback.
 *
 * Only same-origin relative paths survive: the value must start with
 * a single "/", and protocol-relative URLs ("//host"), backslashes,
 * absolute URLs, whitespace/control characters, and loops back into
 * the auth pages all fall back to the default. Anything else (query
 * strings and fragments on an internal path included) is preserved.
 */
export function sanitizeRedirectTarget(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_POST_LOGIN_PATH;
  const value = raw.trim();
  if (value.length === 0) return DEFAULT_POST_LOGIN_PATH;
  if (!value.startsWith("/")) return DEFAULT_POST_LOGIN_PATH;
  if (value.startsWith("//")) return DEFAULT_POST_LOGIN_PATH;
  if (value.includes("\\")) return DEFAULT_POST_LOGIN_PATH;
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return DEFAULT_POST_LOGIN_PATH;
  const pathname = value.split(/[?#]/)[0];
  if (AUTH_LOOP_PATHS.has(pathname)) return DEFAULT_POST_LOGIN_PATH;
  return value;
}

/**
 * The app-level callback URL the browser hands to Supabase as
 * `redirectTo`. The sanitised post-login target rides along as the
 * `redirect` query parameter so the callback route can consume it
 * after the code exchange.
 */
export function buildOAuthCallbackUrl(origin: string, target: unknown): string {
  const safeTarget = sanitizeRedirectTarget(target);
  return `${origin}/auth/callback?redirect=${encodeURIComponent(safeTarget)}`;
}

/**
 * Error codes the callback route is allowed to put on /login. Raw
 * provider error text is NEVER reflected into the page — it collapses
 * into one of these codes, which the login/signup pages map to
 * friendly copy via AUTH_ERROR_MESSAGES.
 */
export type AuthErrorCode =
  | "oauth_cancelled"
  | "oauth_failed"
  | "account_suspended";

/**
 * Maps a raw OAuth provider `error` value (from the callback URL) to
 * a safe app error code. Only `access_denied` — the user backing out
 * at Google's consent screen — is distinguished; everything else is
 * the generic failure.
 */
export function mapProviderOAuthError(
  providerError: string | null | undefined
): AuthErrorCode {
  return providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed";
}

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  oauth_cancelled:
    "Google sign-in was cancelled. You can try again or use your password.",
  oauth_failed:
    "Google sign-in didn't complete. Please try again or use your password.",
  account_suspended:
    "This account has been suspended. Please contact support if you believe this is a mistake.",
};

/**
 * Friendly message for an `?error=` code on the auth pages, or null
 * when the code is absent/unknown (unknown codes render nothing
 * rather than leaking unvetted text into the page).
 */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (AUTH_ERROR_MESSAGES as Record<string, string>)[code] ?? null;
}
