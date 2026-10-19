/**
 * Referral capture — pure core (link building, code parsing, capture
 * validation). Unit-tested; shared by the Referral page, the signup /
 * login capture flow and POST /api/referrals/record.
 *
 * The referral "code" is the referrer's user id — no separate code
 * table exists, and the link is only as meaningful as the profiles
 * record behind the id (the record endpoint validates it exists).
 */

export const REFERRAL_PARAM = "ref";
export const REFERRAL_STORAGE_KEY = "nxtsend_ref_code";

/** Builds the shareable link: <appUrl>/signup?ref=<userId>. */
export function buildReferralLink(appUrl: string, userId: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/signup?${REFERRAL_PARAM}=${encodeURIComponent(userId)}`;
}

/** Extracts a referral code from a query string or URLSearchParams. */
export function parseReferralCode(
  input: string | URLSearchParams | null | undefined
): string | null {
  if (!input) return null;
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  const raw = params.get(REFERRAL_PARAM);
  if (!raw) return null;
  const code = raw.trim();
  // Sanity bounds only — existence is validated against profiles when
  // the referral is recorded, never assumed here.
  if (code.length < 3 || code.length > 128) return null;
  return code;
}

export type ReferralCaptureDecision =
  | { ok: true }
  | { ok: false; reason: "missing_code" | "self_referral" };

/**
 * The capture rules that are OURS to enforce (the endpoint adds the
 * referrer-exists check, which needs the database):
 * a code must be present, and you cannot refer yourself.
 */
export function validateReferralCapture(input: {
  code: string | null;
  newUserId: string;
}): ReferralCaptureDecision {
  if (!input.code) return { ok: false, reason: "missing_code" };
  if (input.code === input.newUserId) return { ok: false, reason: "self_referral" };
  return { ok: true };
}
