import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveWebhookCaller } from "@/lib/webhooks/server";
import { isZapierWebhookEventType } from "@/lib/integrations/zapier/events";
import { emitPlatformEvent } from "@/lib/integrations/rest/emit";
import {
  createPlatformStore,
  getDemoPlatformStore,
} from "@/lib/integrations/rest/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/zapier/emit `{type, data}` — the server
 * side of the browser notifier (src/lib/integrations/zapier/client.ts).
 * Session-authenticated (the same guard as /api/webhooks/emit):
 * the workspace comes from the session, never from the body, so a
 * caller can only emit into their own workspace. Fire-and-forget
 * semantics — the mutation that triggered the emit already
 * succeeded; this route enqueues + best-effort immediate-attempts
 * and always answers 200 for a well-formed event.
 *
 * This route is also the n8n emit path: there is NO separate
 * /api/integrations/n8n/emit route — emitPlatformEvent fans out
 * to every platform's active subscriptions, so one notifier
 * serves both Zapier and n8n (decision documented in
 * src/lib/data/webhook-emission.ts).
 */
export async function POST(req: Request) {
  const resolved = await resolveWebhookCaller();
  if ("response" in resolved) return resolved.response;
  const caller = resolved.caller;
  let body: { type?: unknown; data?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isZapierWebhookEventType(body.type)) {
    return NextResponse.json({ error: "Unknown Zapier webhook event type." }, { status: 400 });
  }
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : {};
  const admin = createAdminClient();
  const store = admin ? createPlatformStore(admin, "zapier") : getDemoPlatformStore();
  await emitPlatformEvent({ store }, body.type, caller.workspaceId, data);
  return NextResponse.json({ ok: true });
}
