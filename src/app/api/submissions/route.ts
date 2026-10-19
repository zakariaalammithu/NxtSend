import { NextRequest, NextResponse } from "next/server";
import { createSubmissionRecord } from "@/lib/admin/platform-server";
import {
  createRateLimiter,
  validateSubmissionInput,
} from "@/lib/admin/submissions-core";

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
 * (the API never trusts the client), length caps, and a per-IP
 * in-memory rate limit (best-effort on serverless — see
 * submissions-core). No auth: this is a public contact endpoint by
 * design, and it can only CREATE unread submission rows.
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

  const validation = validateSubmissionInput(
    (body ?? {}) as Record<string, unknown>
  );
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Validation failed", fields: validation.errors },
      { status: 400 }
    );
  }

  try {
    const result = await createSubmissionRecord(validation.value);
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
