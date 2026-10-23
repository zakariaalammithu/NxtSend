/**
 * Submissions — pure core (types, validation, rate limiting).
 *
 * A "submission" is a public enquiry captured by POST /api/submissions
 * from the marketing contact form (source "contact") or the demo
 * booking-request form (source "demo"). Storage lives behind the admin
 * platform service (Supabase `submissions` table via the service role in
 * live mode; a labelled in-process demo store in Demo Mode). Everything
 * in this file is pure and unit-tested — no I/O.
 */

export type SubmissionSource = "contact" | "demo";
export type SubmissionStatus = "unread" | "read";

/**
 * Outcome of the contact-form email notification (migration 018).
 * Only source "contact" submissions are notified. NULL on a row
 * means "not applicable" (demo bookings) or "not attempted yet".
 *   pending        stored, attempt has not completed
 *   sent           Resend accepted the notification
 *   failed         Resend was configured but rejected/errored
 *   not_configured RESEND_API_KEY / EMAIL_FROM /
 *                  CONTACT_NOTIFICATION_EMAIL missing — no send was
 *                  attempted and none is claimed
 *   simulated      Demo Mode: captured in the demo store only
 */
export type SubmissionNotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "not_configured"
  | "simulated";

export const SUBMISSION_NOTIFICATION_STATUSES: readonly SubmissionNotificationStatus[] =
  ["pending", "sent", "failed", "not_configured", "simulated"];

export interface Submission {
  id: string;
  source: SubmissionSource;
  name: string;
  email: string;
  company: string | null;
  subject: string | null;
  message: string;
  meta: Record<string, unknown>;
  status: SubmissionStatus;
  created_at: string;
  notification_status: SubmissionNotificationStatus | null;
  notification_provider_id: string | null;
  notification_error: string | null;
  notification_attempts: number;
  notification_sent_at: string | null;
  notification_recipient: string | null;
}

export interface SubmissionInput {
  source?: unknown;
  name?: unknown;
  email?: unknown;
  company?: unknown;
  subject?: unknown;
  message?: unknown;
  meta?: unknown;
  /** Honeypot field (see SUBMISSION_HONEYPOT_FIELD). */
  website?: unknown;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field length caps enforced by validateSubmissionInput. */
export const SUBMISSION_FIELD_LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  subject: 200,
  message: 5000,
} as const;

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Validates untrusted JSON from the public submissions route. The rules
 * mirror the marketing forms' own client-side schemas (name ≥ 2 chars,
 * valid email, message ≥ 10 chars) so a request that the form would
 * reject is also rejected server-side — the API never trusts the form.
 *
 * Over-limit fields are REJECTED (400 with a per-field error), never
 * silently truncated: a visitor whose 9,000-character message was cut
 * to 5,000 without being told has effectively lost part of their
 * message while believing it arrived whole. Both sources ("contact"
 * and "demo") follow the same rule — the demo booking form's own
 * fields sit far below these caps.
 */
export function validateSubmissionInput(
  input: SubmissionInput
): ValidationResult<{
  source: SubmissionSource;
  name: string;
  email: string;
  company: string | null;
  subject: string | null;
  message: string;
  meta: Record<string, unknown>;
}> {
  const errors: Record<string, string> = {};

  const source = input.source === "demo" ? "demo" : input.source === "contact" ? "contact" : null;
  if (!source) errors.source = "source must be 'contact' or 'demo'";

  const name = asTrimmedString(input.name);
  if (name.length > SUBMISSION_FIELD_LIMITS.name) {
    errors.name = `name must be at most ${SUBMISSION_FIELD_LIMITS.name} characters`;
  } else if (name.length < 2) {
    errors.name = "name must be at least 2 characters";
  }

  const emailRaw = asTrimmedString(input.email);
  if (emailRaw.length > SUBMISSION_FIELD_LIMITS.email) {
    errors.email = `email must be at most ${SUBMISSION_FIELD_LIMITS.email} characters`;
  }
  const email = emailRaw.toLowerCase();
  if (!errors.email && !EMAIL_RE.test(email)) {
    errors.email = "a valid email address is required";
  }

  const companyRaw = asTrimmedString(input.company);
  if (companyRaw.length > SUBMISSION_FIELD_LIMITS.company) {
    errors.company = `company must be at most ${SUBMISSION_FIELD_LIMITS.company} characters`;
  }

  const subjectRaw = asTrimmedString(input.subject);
  if (subjectRaw.length > SUBMISSION_FIELD_LIMITS.subject) {
    errors.subject = `subject must be at most ${SUBMISSION_FIELD_LIMITS.subject} characters`;
  }

  const message = asTrimmedString(input.message);
  if (message.length > SUBMISSION_FIELD_LIMITS.message) {
    errors.message = `message must be at most ${SUBMISSION_FIELD_LIMITS.message} characters`;
  } else if (message.length < 10) {
    errors.message = "message must be at least 10 characters";
  }

  const meta =
    input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : {};

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      source: source as SubmissionSource,
      name,
      email,
      company: companyRaw.length > 0 ? companyRaw : null,
      subject: subjectRaw.length > 0 ? subjectRaw : null,
      message,
      meta,
    },
  };
}

// ── Honeypot ────────────────────────────────────────────────────────────────

/**
 * The contact form renders a hidden "website" field that humans never
 * see or fill (off-screen, tabindex -1, autocomplete off). A non-empty
 * value means a bot filled every field it could find. The route
 * answers tripped submissions with the generic success shape but
 * stores nothing and sends nothing, so the trap is indistinguishable
 * from a real success to the submitter.
 */
export const SUBMISSION_HONEYPOT_FIELD = "website";

export function isHoneypotTripped(input: SubmissionInput): boolean {
  const value = (input as Record<string, unknown>)[SUBMISSION_HONEYPOT_FIELD];
  return typeof value === "string" && value.trim().length > 0;
}

// ── Rate limiting ───────────────────────────────────────────────────────────

export interface RateLimiter {
  /** Records an attempt for `key`; returns true when it is allowed. */
  check(key: string, nowMs: number): boolean;
}

/**
 * Fixed-window in-memory rate limiter (per key, e.g. per IP). In-memory
 * means per-process — on serverless this is a best-effort brake against
 * casual form spam, not a distributed guarantee; the alternative (a DB
 * table) is noted in SETUP.md. Pure given an injected clock.
 */
export function createRateLimiter(options: {
  maxAttempts: number;
  windowMs: number;
}): RateLimiter {
  const buckets = new Map<string, { windowStart: number; count: number }>();
  return {
    check(key: string, nowMs: number): boolean {
      const bucket = buckets.get(key);
      if (!bucket || nowMs - bucket.windowStart >= options.windowMs) {
        buckets.set(key, { windowStart: nowMs, count: 1 });
        return true;
      }
      if (bucket.count >= options.maxAttempts) return false;
      bucket.count += 1;
      return true;
    },
  };
}
