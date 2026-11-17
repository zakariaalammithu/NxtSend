import { NextResponse } from "next/server";
import { attemptPlatformDelivery } from "@/lib/integrations/rest/outbox";
import { buildEventEnvelope } from "@/lib/integrations/rest/events";
import { resolveN8nWebhookRoute, readN8nJsonBody } from "../helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/n8n/webhooks/test `{id}` — Bearer (n8n
 * OAuth token, write tier). Sends a test envelope for the
 * subscription's event to its target URL right now, through the
 * same signed attempt path as a real delivery. The test delivery
 * is a real outbox row (visible in the deliveries list) so the
 * attempt is inspectable afterwards. Inactive subscription →
 * 400; unknown id / another workspace's id / a Zapier
 * subscription → 404.
 */
export async function POST(req: Request) {
  const resolved = await resolveN8nWebhookRoute(req, "write");
  if (!resolved.ok) return resolved.response;
  const { ctx, store } = resolved;
  const body = await readN8nJsonBody(req);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required.", code: "invalid_params" }, { status: 400 });
  }
  const sub = await store.getSubscription(id);
  if (!sub || sub.workspace_id !== ctx.workspaceId || sub.platform !== "n8n") {
    return NextResponse.json(
      { error: "Subscription not found in this workspace.", code: "not_found" },
      { status: 404 }
    );
  }
  if (!sub.active) {
    return NextResponse.json(
      { error: "Subscription is inactive.", code: "subscription_inactive" },
      { status: 400 }
    );
  }
  const envelope = buildEventEnvelope(sub.event, ctx.workspaceId, {
    test: true,
    subscription_id: sub.id,
  });
  const delivery = await store.enqueueDelivery({
    event_id: envelope.id,
    subscription_id: sub.id,
    workspace_id: ctx.workspaceId,
    event: sub.event,
    payload: envelope,
    platform: "n8n",
  });
  const result = await attemptPlatformDelivery({ store }, delivery);
  return NextResponse.json({
    ok: true,
    delivery: {
      id: delivery.id,
      event: delivery.event,
      status: result.status,
      attempts: result.attempts,
      unsubscribed: result.unsubscribed,
    },
  });
}
