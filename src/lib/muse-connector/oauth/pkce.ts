/**
 * PKCE (RFC 7636) — S256 only.
 *
 * OAuth 2.1 requires PKCE for the authorization-code flow, and Muse
 * clients use S256. `plain` is refused outright (never accepted as a
 * fallback), and a missing challenge is refused — there is no
 * challenge-less code exchange.
 */

import { createHash, timingSafeEqual } from "crypto";

/** S256 code_challenge = BASE64URL(SHA256(verifier)). */
export function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

/**
 * Verifies a verifier against a stored S256 challenge, in constant
 * time. Returns false for ANY problem: missing/empty verifier or
 * challenge, or a mismatch. Never throws.
 */
export function verifyCodeChallenge(
  verifier: string | null | undefined,
  challenge: string | null | undefined
): boolean {
  if (!verifier || !challenge) return false;
  // RFC 7636: verifier is 43–128 chars from [A-Za-z0-9-._~].
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;
  const expected = computeCodeChallenge(verifier);
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True only for the S256 method — `plain` (and anything else) is refused. */
export function isS256Method(method: string | null | undefined): boolean {
  return method === "S256";
}
