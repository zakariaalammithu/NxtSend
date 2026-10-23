import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { previewSupportAnswer } from "@/lib/support/admin-service";
import {
  readJsonBody,
  withSupportAdmin,
} from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/support/knowledge/preview { question } — run the
 * REAL answer pipeline (matcher + optional grounded AI) against a
 * question and report the band, top candidates with scores, the
 * would-be answer and its sources. Writes NOTHING: no conversation,
 * no message. Rate-limited because it can invoke the AI provider.
 */

const limiter = createRateLimiter({ maxAttempts: 30, windowMs: 60 * 1000 });

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(async ({ store, actor, permissions }) => {
    if (!limiter.check(actor.profileId ?? actor.email, Date.now())) {
      return {
        status: 429,
        body: { error: "Too many preview requests. Please slow down." },
      };
    }
    return previewSupportAnswer(store, actor, permissions, {
      question: parsed.value.question,
    });
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
