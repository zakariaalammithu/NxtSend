/**
 * Referral capture — client helper (Stage E).
 *
 * Flow: the signup page stashes ?ref=<referrerId> in localStorage on
 * arrival; once an account session exists (immediately after signup,
 * or at first sign-in when email confirmation delayed the session),
 * the auth forms call recordPendingReferral() to POST the stash to
 * /api/referrals/record. Fire-and-forget: a failed record never
 * blocks or breaks signup/login, and the stash is cleared before the
 * POST so it cannot double-record across retries.
 */

import { REFERRAL_STORAGE_KEY } from "./core";

/** Stash a referral code from the current URL, if present. */
export function stashReferralCodeFromUrl(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && ref.trim()) {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, ref.trim());
    }
  } catch {
    // localStorage unavailable — capture is best-effort by design.
  }
}

/** Record a stashed referral against the now-active session. */
export async function recordPendingReferral(): Promise<void> {
  try {
    const ref = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!ref) return;
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    await fetch("/api/referrals/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    });
  } catch {
    // Best-effort by design.
  }
}
