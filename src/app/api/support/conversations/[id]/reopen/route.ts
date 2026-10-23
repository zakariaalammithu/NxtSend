import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { reopenSupportConversation } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import { rateLimited, withSupportStore } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations/[id]/reopen — a visitor reopens
 * their own resolved conversation (status resolved -> open, event
 * appended). No-op when the conversation is not resolved. (Simply
 * sending a new message also reopens — that happens in the store's
 * message write path.)
 */

const limiter = createRateLimiter({ maxAttempts: 30, windowMs: 10 * 60 * 1000 });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!limiter.check(params.id, Date.now())) return rateLimited();
  const identity = await resolveVisitorIdentity(request);

  return withSupportStore(async (store) => {
    const result = await reopenSupportConversation(store, identity, params.id);
    return NextResponse.json(result.body, { status: result.status });
  });
}
