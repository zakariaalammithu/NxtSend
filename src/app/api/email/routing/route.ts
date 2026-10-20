/**
 * Reply-routing & unsubscribe-signing status — GET /api/email/routing
 *
 * Feeds the Email Routing panel on the Resend integration page:
 *  - where replies to outbound mail will land (EMAIL_REPLY_TO when
 *    set; otherwise the EMAIL_FROM address, with the warning that the
 *    reply loop only fires if that domain receives mail), and
 *  - whether unsubscribe signing is configured (dedicated secret /
 *    derived from the service-role key / demo / unconfigured) —
 *    status only; NO secret value is ever returned.
 *
 * Same guards as the other workspace APIs (resolveCenterContext).
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { getEmailReplyTo } from "@/lib/email/state";
import { extractEmailDomain } from "@/lib/email/domains";
import {
  getUnsubscribeSigningStatus,
  resolveUnsubscribeBaseUrl,
} from "@/lib/email/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  const replyTo = getEmailReplyTo() ?? null;
  const from = process.env.EMAIL_FROM?.trim() || null;
  const fromDomain = extractEmailDomain(from ?? undefined);
  const signing = getUnsubscribeSigningStatus();
  const base = resolveUnsubscribeBaseUrl();

  return NextResponse.json({
    mode: ctx.mode,
    replyTo,
    from,
    fromDomain,
    repliesRouteTo: replyTo ?? from,
    replyToConfigured: replyTo !== null,
    unsubscribeSigning: signing,
    unsubscribeBaseUrl: base.url,
    // base is a discriminated union: { url } | { url: null, reason }.
    unsubscribeBaseError: "reason" in base ? base.reason : null,
  });
}
