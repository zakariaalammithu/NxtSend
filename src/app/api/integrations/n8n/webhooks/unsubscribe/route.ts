import { NextResponse } from "next/server";
import { unsubscribePlatformWebhook } from "@/lib/integrations/rest/outbox";
import { recordPlatformAudit } from "@/lib/integrations/rest/audit";
import { resolveN8nWebhookRoute, readN8nJsonBody } from "../helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/n8n/webhooks/unsubscribe `{id}` — Bearer
 * (n8n OAuth token, write tier). Deactivates the subscription
 * (never hard-deletes — the audit trail stays). Idempotent:
 * unknown id / another workspace's id / a Zapier subscription →
 * 404, already-inactive → 200.
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
  const result = await unsubscribePlatformWebhook(store, "n8n", ctx.workspaceId, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Subscription not found.", code: result.code ?? "not_found" },
      { status: result.status }
    );
  }
  await recordPlatformAudit({
    platform: "n8n",
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "webhook_unsubscribed",
    resource: `n8n:webhook:${id}`,
    details: "n8n webhook unsubscribed.",
  });
  return NextResponse.json({ id, unsubscribed: true });
}
