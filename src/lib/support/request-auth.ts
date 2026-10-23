/**
 * Support visitor identity resolution (P10 Stage E).
 *
 * A request may carry two independent proofs:
 *  - a registered session (Supabase SSR cookies) — resolved against
 *    the profiles row, never against user metadata;
 *  - the guest cookie token (hashed here; the raw value is used for
 *    nothing else and never logged).
 *
 * Access to a conversation passes when EITHER proof matches the
 * conversation (session ownership OR guest token hash). A bare
 * conversation ID is never a proof.
 */

import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { SUPPORT_GUEST_COOKIE, hashGuestToken, isGuestTokenExpired } from "./guest-auth";
import type { SupportConversation } from "./types";

export interface VisitorSession {
  userId: string;
  displayName: string | null;
  status: "active" | "suspended";
}

export interface VisitorIdentity {
  user: VisitorSession | null;
  guestTokenHash: string | null;
}

export async function resolveVisitorIdentity(request: NextRequest): Promise<VisitorIdentity> {
  let user: VisitorSession | null = null;

  const supabase = await createServerClient();
  if (supabase) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, status")
        .eq("id", authUser.id)
        .single();
      user = {
        userId: authUser.id,
        displayName: profile?.full_name ?? null,
        status: profile?.status === "suspended" ? "suspended" : "active",
      };
    }
  }

  const rawToken = request.cookies.get(SUPPORT_GUEST_COOKIE)?.value;
  const guestTokenHash = rawToken ? hashGuestToken(rawToken) : null;

  return { user, guestTokenHash };
}

/** Either proof may match; an expired guest token matches nothing. */
export function authoriseConversationAccess(
  conversation: SupportConversation,
  identity: VisitorIdentity
): boolean {
  if (identity.user && conversation.user_id === identity.user.userId) return true;
  if (
    identity.guestTokenHash &&
    conversation.guest_access_token_hash === identity.guestTokenHash &&
    !isGuestTokenExpired(conversation.guest_token_expires_at)
  ) {
    return true;
  }
  return false;
}
