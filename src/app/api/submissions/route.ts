import { NextRequest, NextResponse } from "next/server";
import {
  createSubmissionRecord,
  notifyContactSubmission,
} from "@/lib/admin/platform-server";
import {
  createRateLimiter,
  isHoneypotTripped,
  validateSubmissionInput,
} from "@/lib/admin/submissions-core";
import { getDataMode } from "@/lib/data/mode";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/submissions — public enquiry capture for the marketing
 * contact form (source "contact") and the demo booking-request form
 * (source "demo").
 *
 * Before this route existed the forms console.log'd and DISCARDED
 * every submission while showing a success message. Now a success
 * response means the enquiry is actually stored (submissions table in
 * live mode; the labelled demo store in Demo Mode) and visible to
 * admins under Admin → Submissions.
 *
 * Defences: server-side validation mirroring the forms' own schemas
 * (the API never trusts the client), length caps enforced by
 * REJECTION (over-limit → 400, never silent truncation), a honeypot
 * field (tripped → generic success shape, nothing stored, nothing
 * sent), and a per-IP in-memory rate limit (best-effort on
 * serverless — see submissions-core). No auth: this is a public
 * contact endpoint by design, and it can only CREATE unread
 * submission rows.
 *
 * Contact submissions (source "contact" only) trigger an email
 * notification to CONTACT_NOTIFICATION_EMAIL after persistence
 * (P10 Stage C, migration 018). The notification outcome is recorded
 * on the row; the visitor's response NEVER depends on it — a stored
 * message with a failed/unconfigured notification is still a
 * successful submission, and no response ever claims an email was
 * sent.
 */

const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  if (!limiter.check(clientKey(request), Date.now())) {
    return NextResponse.json(
      { error: "Too many submissions from this address. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawBody = (body ?? {}) as Record<string, unknown>;

  // Honeypot: a filled hidden field means a bot. Answer with the
  // generic success shape — but store nothing and send nothing, so
  // the trap is indistinguishable from a real success.
  if (isHoneypotTripped(rawBody)) {
    return NextResponse.json(
      { ok: true, id: generateId(), mode: getDataMode() },
      { status: 201 }
    );
  }

  const validation = validateSubmissionInput(rawBody);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Validation failed", fields: validation.errors },
      { status: 400 }
    );
  }

  try {
    const result = await createSubmissionRecord(validation.value);

    // Notification step — contact enquiries only, AFTER the row is
    // safely stored. Fully best-effort: any failure here is recorded
    // on the row (or logged) and never changes the visitor's 201.
    if (validation.value.source === "contact") {
      try {
        await notifyContactSubmission(result.mode, {
          id: result.id,
          source: "contact",
          name: validation.value.name,
          email: validation.value.email,
          subject: validation.value.subject,
          message: validation.value.message,
          created_at: new Date().toISOString(),
          notification_attempts: 0,
          notification_sent_at: null,
        });
      } catch (err) {
        console.error(
          "[Submissions] Notification step failed (submission kept):",
          err
        );
      }
    }

    return NextResponse.json(
      { ok: true, id: result.id, mode: result.mode },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Submissions] Failed to store submission:", err);
    return NextResponse.json(
      { error: "Could not store your message. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
