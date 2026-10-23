import { NextRequest, NextResponse } from "next/server";
import { getCurrentSupportConversation } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import { withSupportStore } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/conversations/current?after=<sequence_no>
 * The caller's current conversation (session user or guest cookie)
 * plus its visitor-safe messages — internal notes are never in this
 * projection. `after` supports the widget's polling reconciliation:
 * only messages after that sequence number are returned.
 */
export async function GET(request: NextRequest) {
  const identity = await resolveVisitorIdentity(request);
  const afterRaw = request.nextUrl.searchParams.get("after");
  const after = afterRaw !== null ? Number(afterRaw) : undefined;
  const afterSequence = after !== undefined && Number.isFinite(after) && after >= 0 ? Math.floor(after) : undefined;

  return withSupportStore(async (store) => {
    const result = await getCurrentSupportConversation(store, identity, afterSequence);
    const response = NextResponse.json(result.body, { status: result.status });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
