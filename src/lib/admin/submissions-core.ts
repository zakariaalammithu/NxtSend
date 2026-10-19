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
}

export interface SubmissionInput {
  source?: unknown;
  name?: unknown;
  email?: unknown;
  company?: unknown;
  subject?: unknown;
  message?: unknown;
  meta?: unknown;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function asTrimmedString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Validates untrusted JSON from the public submissions route. The rules
 * mirror the marketing forms' own client-side schemas (name ≥ 2 chars,
 * valid email, message ≥ 10 chars) so a request that the form would
 * reject is also rejected server-side — the API never trusts the form.
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

  const name = asTrimmedString(input.name, 120);
  if (name.length < 2) errors.name = "name must be at least 2 characters";

  const email = asTrimmedString(input.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = "a valid email address is required";

  const companyRaw = asTrimmedString(input.company, 160);
  const subjectRaw = asTrimmedString(input.subject, 200);

  const message = asTrimmedString(input.message, 5000);
  if (message.length < 10) errors.message = "message must be at least 10 characters";

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
