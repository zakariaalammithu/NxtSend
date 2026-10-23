/**
 * Support guest identity (P10 Stage E).
 *
 * A guest conversation is authorised by a high-entropy bearer token
 * that exists in exactly two places: the visitor's HttpOnly cookie
 * and — as a SHA-256 hash — the conversation row. The raw token is
 * returned ONCE, inside the create response's Set-Cookie header; it
 * never appears in a response body, a URL, a log line or analytics.
 *
 * A conversation ID alone NEVER authorises: every visitor-side read
 * and write re-checks the cookie token's hash (or the registered
 * session's ownership) against the conversation row.
 *
 * There is deliberately NO guest→user merge by email: an email
 * address a guest typed is display data, not identity proof. (A
 * same-browser attach flow is a possible future addition; it is not
 * part of this stage.)
 */

import { createHash, randomBytes } from "node:crypto";

export const SUPPORT_GUEST_COOKIE = "nxtsend_support_guest";
export const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isGuestTokenExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** Cookie attributes for the guest token (set on the create response). */
export function guestCookieOptions(now = new Date()): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  expires: Date;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Scoped to the support API: the token is never sent anywhere else.
    path: "/api/support",
    expires: new Date(now.getTime() + GUEST_TOKEN_TTL_MS),
  };
}
