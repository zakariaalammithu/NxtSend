import { NextRequest, NextResponse } from "next/server";
import {
  recordAdminAudit,
  resolveAdminGate,
  setSubmissionStatus,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/submissions/status  { id, status: "read" | "unread" }
 * Triage for Admin → Submissions. Same admin gate as the list route.
 */
export async function POST(request: NextRequest) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (body.status !== "read" && body.status !== "unread") {
    return NextResponse.json(
      { error: 'status must be "read" or "unread"' },
      { status: 400 }
    );
  }

  const updated = await setSubmissionStatus(gate.mode, body.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  await recordAdminAudit({
    mode: gate.mode,
    actorId: gate.caller?.id ?? null,
    actorEmail: gate.caller?.email ?? "demo-admin",
    action: body.status === "read" ? "SUBMISSION_READ" : "SUBMISSION_UNREAD",
    resource: `submission:${body.id}`,
    details: `Marked submission ${body.id} as ${body.status}`,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
