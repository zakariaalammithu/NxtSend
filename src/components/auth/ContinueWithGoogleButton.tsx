"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildOAuthCallbackUrl,
  sanitizeRedirectTarget,
} from "@/lib/auth/oauth";

/**
 * "Continue with Google" — shared by the login and signup pages.
 *
 * Starts Supabase Auth's Google OAuth flow (authorization code +
 * PKCE; Supabase owns state/nonce — see src/lib/auth/oauth.ts). The
 * Google client secret never touches this app: it lives in the
 * Supabase dashboard (Authentication → Providers → Google).
 *
 * Honest states, never a fake flow:
 *  - Supabase not configured (Demo Mode — the browser client is
 *    null): the button renders DISABLED with a note that Google
 *    sign-in becomes available once authentication is configured.
 *    No mock sign-in, no simulated redirect.
 *  - Externally disabled (e.g. signups closed on the signup page):
 *    disabled, with the caller's note.
 *  - The provider start call itself errors: an inline message under
 *    the button; the password form below stays fully usable.
 */

/** The official multicolour Google "G" mark (a provider logo — it is
 *  never recoloured or replaced by the NxtSend mark). */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.58v2.97h3.87c2.27-2.09 3.56-5.17 3.56-8.74z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-2.97c-1.08.72-2.45 1.15-4.07 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.07A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.32A7.19 7.19 0 0 1 4.91 12c0-.81.14-1.59.38-2.32V6.61H1.29a12 12 0 0 0 0 10.78l4-3.07z"
      />
      <path
        fill="#EA4335"
        d="M12 4.73c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.61l4 3.07C6.23 6.84 8.88 4.73 12 4.73z"
      />
    </svg>
  );
}

/** The "or" divider used between the Google button and the email
 *  form — same markup pattern the auth forms already use. */
export function AuthOrDivider() {
  return (
    <div className="relative my-6 text-center" aria-hidden="true">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-black-600/70" />
      </div>
      <span className="relative bg-black-800 px-3 text-12 text-black-400 uppercase tracking-wider">
        or
      </span>
    </div>
  );
}

export interface ContinueWithGoogleButtonProps {
  /** Post-login target; sanitised before use. */
  redirect?: string | null;
  /** External gate (e.g. signups closed) — disables the button. */
  disabled?: boolean;
  /** Note shown under the button when externally disabled. */
  disabledNote?: string;
}

export default function ContinueWithGoogleButton({
  redirect,
  disabled = false,
  disabledNote,
}: ContinueWithGoogleButtonProps) {
  // The browser client is null exactly when Supabase is not
  // configured (Demo Mode) — the same signal the auth forms use.
  const supabase = React.useMemo(() => createClient(), []);
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  const notConfigured = supabase === null;
  const isDisabled = disabled || notConfigured || starting;

  const onClick = async () => {
    if (!supabase || starting) return;
    setStartError(null);
    setStarting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildOAuthCallbackUrl(
            window.location.origin,
            sanitizeRedirectTarget(redirect)
          ),
        },
      });
      if (error) {
        // The browser stays on this page; the password form below
        // remains fully usable.
        setStartError(
          "Google sign-in couldn't be started. Please try again or use your password."
        );
        setStarting(false);
      }
      // On success the browser is navigating to Google — leave the
      // loading state in place.
    } catch {
      setStartError(
        "Google sign-in couldn't be started. Please try again or use your password."
      );
      setStarting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white hover:bg-black-100 text-black-900 font-semibold py-3 px-4 text-14 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
      >
        {starting ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            <span>Redirecting to Google…</span>
          </>
        ) : (
          <>
            <GoogleMark className="h-5 w-5 shrink-0" />
            <span>Continue with Google</span>
          </>
        )}
      </button>
      {notConfigured && (
        <p className="mt-2.5 text-12 text-black-400 text-center">
          Google sign-in becomes available once authentication is
          configured.
        </p>
      )}
      {!notConfigured && disabled && disabledNote && (
        <p className="mt-2.5 text-12 text-black-400 text-center">
          {disabledNote}
        </p>
      )}
      {startError && (
        <p className="mt-2.5 text-12 text-rose-400 text-center" role="alert">
          {startError}
        </p>
      )}
    </div>
  );
}
