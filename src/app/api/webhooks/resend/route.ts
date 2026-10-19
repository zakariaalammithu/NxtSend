import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { handleResendWebhook } from "@/lib/email/webhook";
import { createSupabaseEmailEventStore } from "@/lib/email/store";
import { createResendReceivedEmailFetcher } from "@/lib/email/receiving";

/**
 * POST /api/webhooks/resend
 *
 * Receives Resend delivery events (sent / delivered / bounced /
 * complained / …) and inbound mail notifications (email.received).
 * Every request is Svix-signature-verified against
 * RESEND_WEBHOOK_SECRET; when the secret is unset the route rejects
 * with 503 — unverified events are never accepted. Verified events are
 * deduplicated by svix-id and applied to `messages` (status) and
 * `suppression_list` (bounce/complaint) via the service role.
 * `email.received` events carry metadata only: the message content is
 * fetched from the Receiving API and ingested into the matching inbox
 * conversation (see src/lib/inbox/inbound.ts and SETUP.md §6).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const admin = createAdminClient();

  const result = await handleResendWebhook({
    rawBody,
    headers: {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
    store: admin ? createSupabaseEmailEventStore(admin) : null,
    fetchReceivedEmail: createResendReceivedEmailFetcher(process.env.RESEND_API_KEY),
  });

  return NextResponse.json(result.body, { status: result.status });
}
