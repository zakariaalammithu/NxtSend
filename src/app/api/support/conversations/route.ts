import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { SUPPORT_GUEST_COOKIE, guestCookieOptions } from "@/lib/support/guest-auth";
import { createSupportConversation } from "@/lib/support/public-service";
import { resolveVisitorIdentity } from "@/lib/support/request-auth";
import {
  clientKey,
  rateLimited,
  readJsonBody,
  withSupportStore,
} from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations — start a support conversation.
 *
 * Registered users (session) get one open thread, reused. Guests get
 * a 256-bit token whose SHA-256 hash is stored; the RAW token is
 * returned exactly once, as an HttpOnly cookie scoped to /api/support
 * (SameSite=Lax, Secure in production). It never appears in the body.
 * An optional firstMessage runs the bot pipeline immediately.
 */

const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

export async function POST(request: NextRequest) {
  if (!limiter.check(clientKey(request), Date.now())) return rateLimited();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const identity = await resolveVisitorIdentity(request);

  return withSupportStore(async (store) => {
    const result = await createSupportConversation(store, identity, {
      name: parsed.value.name,
      email: parsed.value.email,
      firstMessage: parsed.value.first_message ?? parsed.value.firstMessage,
      entryPage: parsed.value.entry_page ?? parsed.value.entryPage,
    });
    const response = NextResponse.json(result.body, { status: result.status });
    if (result.rawGuestToken) {
      response.cookies.set(SUPPORT_GUEST_COOKIE, result.rawGuestToken, guestCookieOptions());
    }
    return response;
  });
}
