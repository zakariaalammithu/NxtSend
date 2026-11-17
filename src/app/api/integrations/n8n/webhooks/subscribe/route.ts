import { NextResponse } from "next/server";
import { subscribePlatformWebhook } from "@/lib/integrations/rest/outbox";
import { recordPlatformAudit } from "@/lib/integrations/rest/audit";
import { resolveN8nWebhookRoute, readN8nJsonBody } from "../helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/n8n/webhooks/subscribe `{event, target_url}`
 * — Bearer (n8n OAuth token, write tier). Creates an n8n webhook
 * subscription for one event. The target URL must be an n8n
 * webhook URL (any public https host — never a Zapier hook URL,
 * never localhost/private IPs in production). A duplicate (same
 * workspace + event + target_url, still active) returns the
 * existing subscription. The per-subscription HMAC secret is
 * generated server-side and is NEVER in the response.
 */
export async function POST(req: Request) {
  const resolved = await resolveN8nWebhookRoute(req, "write");
  if (!resolved.ok) return resolved.response;
  const { ctx, store } = resolved;
  const body = await readN8nJsonBody(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const result = await subscribePlatformWebhook(store, "n8n", ctx.workspaceId, ctx.userId, {
    event: body.event,
    target_url: body.target_url,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  await recordPlatformAudit({
    platform: "n8n",
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "webhook_subscribed",
    resource: `n8n:webhook:${result.subscription.id}`,
    details: `n8n webhook subscribed for ${result.subscription.event} → ${result.subscription.target_url}.`,
  });
  // Safe fields only — the per-subscription secret is NEVER here.
  const { id, event, target_url, active, created_at, updated_at } = result.subscription;
  return NextResponse.json(
    { subscription: { id, event, target_url, active, created_at, updated_at } },
    { status: 201 }
  );
}
