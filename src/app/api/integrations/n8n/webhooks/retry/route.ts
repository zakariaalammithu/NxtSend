import { NextResponse } from "next/server";
import { resolveN8nWebhookRoute, readN8nJsonBody } from "../helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/n8n/webhooks/retry `{id}` — Bearer (n8n
 * OAuth token, write tier). Requeues a failed or dead delivery
 * for the `n8n_webhook_retry` job: status back to `failed`,
 * `next_retry_at` now, so the next job tick attempts it again.
 * A dead delivery at the attempt cap gets one more attempt
 * (attempts reset to max_attempts - 1). Already-delivered or
 * still-pending deliveries → 409; unknown id / another
 * workspace's id / a Zapier delivery → 404.
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
  const delivery = await store.getDelivery(id);
  if (!delivery || delivery.workspace_id !== ctx.workspaceId || delivery.platform !== "n8n") {
    return NextResponse.json(
      { error: "Delivery not found in this workspace.", code: "not_found" },
      { status: 404 }
    );
  }
  if (delivery.status === "delivered") {
    return NextResponse.json(
      { error: "Delivery was already delivered.", code: "already_delivered" },
      { status: 409 }
    );
  }
  if (delivery.status === "pending") {
    return NextResponse.json(
      { error: "Delivery is still pending its first attempt.", code: "not_failed" },
      { status: 409 }
    );
  }
  const attempts = Math.min(delivery.attempts, delivery.max_attempts - 1);
  const nextRetryAt = new Date().toISOString();
  await store.updateDelivery(delivery.id, {
    status: "failed",
    attempts,
    next_retry_at: nextRetryAt,
    last_error: delivery.last_error,
  });
  return NextResponse.json({
    ok: true,
    delivery: {
      id: delivery.id,
      event: delivery.event,
      status: "failed",
      attempts,
      next_retry_at: nextRetryAt,
    },
  });
}
