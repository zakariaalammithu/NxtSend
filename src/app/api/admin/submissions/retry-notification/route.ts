import { NextRequest, NextResponse } from "next/server";
import {
  getSubmissionById,
  notifyContactSubmission,
  recordAdminAudit,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/submissions/retry-notification  { id }
 *
 * Re-runs the contact-form email notification for a stored
 * submission (P10 Stage C) — the recovery path when the original
 * attempt landed in `failed` or `not_configured` (e.g. the Resend
 * key or CONTACT_NOTIFICATION_EMAIL was only configured afterwards).
 * Same admin gate as the other submissions routes; the outcome is
 * recorded back on the row (migration 018) and an audit entry is
 * written.
 *
 * Only contact-form submissions have a notification; demo bookings
 * are refused with 400. In Demo Mode the retry records "simulated"
 * — no email is sent or claimed there either.
 */
export async function POST(request: NextRequest) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const submission = await getSubmissionById(gate.mode, body.id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.source !== "contact") {
    return NextResponse.json(
      { error: "Notifications only apply to contact-form submissions" },
      { status: 400 }
    );
  }

  const status = await notifyContactSubmission(gate.mode, submission);

  await recordAdminAudit({
    mode: gate.mode,
    actorId: gate.caller?.id ?? null,
    actorEmail: gate.caller?.email ?? "demo-admin",
    action: "SUBMISSION_NOTIFICATION_RETRY",
    resource: `submission:${submission.id}`,
    details: `Retried contact notification for submission ${submission.id}; outcome: ${status ?? "n/a"}`,
  });

  return NextResponse.json({ ok: true, notification_status: status });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
