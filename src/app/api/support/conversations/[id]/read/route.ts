import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { markSupportVisitorRead } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import { rateLimited, withSupportStore } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations/[id]/read — mark the visitor side
 * read (watermarks + unread counter reset, in the store's one write
 * path). Same authorisation as every visitor route.
 */

const limiter = createRateLimiter({ maxAttempts: 60, windowMs: 10 * 60 * 1000 });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!limiter.check(params.id, Date.now())) return rateLimited();
  const identity = await resolveVisitorIdentity(request);

  return withSupportStore(async (store) => {
    const result = await markSupportVisitorRead(store, identity, params.id);
    return NextResponse.json(result.body, { status: result.status });
  });
}
