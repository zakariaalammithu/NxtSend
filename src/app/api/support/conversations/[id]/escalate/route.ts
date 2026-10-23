import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { escalateSupportConversation } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import { rateLimited, withSupportStore } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations/[id]/escalate — hand the
 * conversation to the human support team (handling_mode -> human;
 * status stays open; the event is appended). The response says
 * truthfully whether an agent has declared themselves available —
 * no estimated response time is ever invented. Blocked with the
 * offline/contact path when settings disallow escalation.
 */

const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!limiter.check(params.id, Date.now())) return rateLimited();
  const identity = await resolveVisitorIdentity(request);

  return withSupportStore(async (store) => {
    const result = await escalateSupportConversation(store, identity, params.id);
    return NextResponse.json(result.body, { status: result.status });
  });
}
