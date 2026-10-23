import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { postSupportMessage } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import {
  clientKey,
  rateLimited,
  readJsonBody,
  withSupportStore,
} from "@/lib/support/route-helpers";
import { validateClientMessageId } from "@/lib/support/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations/[id]/messages — send a visitor/user
 * message. Authorisation is by session ownership or the guest cookie
 * token hash — the ID in the URL alone never authorises (unknown and
 * unauthorised look identical: 404). Supports client_message_id
 * idempotent retries; runs the bot pipeline in bot mode and returns
 * the persisted message plus any assistant reply for reconciliation.
 */

const perConversation = createRateLimiter({ maxAttempts: 30, windowMs: 10 * 60 * 1000 });
const perIp = createRateLimiter({ maxAttempts: 60, windowMs: 10 * 60 * 1000 });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const now = Date.now();
  if (!perConversation.check(params.id, now)) return rateLimited();
  if (!perIp.check(clientKey(request), now)) return rateLimited();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const identity = await resolveVisitorIdentity(request);

  return withSupportStore(async (store) => {
    const result = await postSupportMessage(store, identity, params.id, {
      body: parsed.value.body,
      clientMessageId: validateClientMessageId(
        parsed.value.client_message_id ?? parsed.value.clientMessageId
      ),
    });
    return NextResponse.json(result.body, { status: result.status });
  });
}
