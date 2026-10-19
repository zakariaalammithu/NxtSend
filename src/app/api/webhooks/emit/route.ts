import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveWebhookCaller, getDemoWebhookConfig } from "@/lib/webhooks/server";
import { buildEventEnvelope, isWebhookEventType } from "@/lib/webhooks/events";
import { dispatchEvent, getDemoWebhookStore } from "@/lib/webhooks/dispatch";
import {
  getWorkspaceWebhookConfig,
  createSupabaseWebhookStore,
} from "@/lib/webhooks/store";

/**
 * POST /api/webhooks/emit  { type, data }
 *
 * Called (fire-and-forget) by the data layer after real user actions.
 * The server resolves the workspace from the session, loads that
 * workspace's subscription server-side (the browser never sees the URL
 * secret), signs the payload and dispatches. The response states
 * honestly whether anything was dispatched and with what outcome —
 * in Demo Mode every delivery is simulated and labelled as such.
 */
export async function POST(req: Request) {
  const resolved = await resolveWebhookCaller();
  if ("response" in resolved) return resolved.response;
  const { caller } = resolved;

  let body: { type?: unknown; data?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isWebhookEventType(body.type)) {
    return NextResponse.json(
      { error: "Unknown event type." },
      { status: 400 }
    );
  }
  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};
  if (JSON.stringify(data).length > 20_000) {
    return NextResponse.json({ error: "Event data too large." }, { status: 400 });
  }

  const envelope = buildEventEnvelope(body.type, caller.workspaceId, data);

  if (caller.mode === "demo") {
    const config = getDemoWebhookConfig();
    if (!config || !config.enabled || !config.events.includes(body.type)) {
      return NextResponse.json({
        dispatched: false,
        state: "demo",
        reason: !config
          ? "No webhook subscription configured (Demo Mode, in-memory)."
          : !config.enabled
            ? "Webhook subscription is disabled."
            : "This event type is not subscribed.",
      });
    }
    const delivery = await dispatchEvent(
      { store: getDemoWebhookStore(), simulated: true },
      config,
      envelope
    );
    return NextResponse.json({
      dispatched: true,
      state: "demo",
      status: delivery.status,
      deliveryId: delivery.id,
      note: "Demo Mode: delivery simulated and logged — the endpoint was NOT called.",
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured.", state: "configuration_required" },
      { status: 503 }
    );
  }
  const config = await getWorkspaceWebhookConfig(admin, caller.workspaceId);
  if (!config || !config.enabled || !config.events.includes(body.type)) {
    return NextResponse.json({
      dispatched: false,
      state: !config ? "not_connected" : "connected",
      reason: !config
        ? "No webhook subscription configured for this workspace."
        : !config.enabled
          ? "Webhook subscription is disabled."
          : "This event type is not subscribed.",
    });
  }
  const delivery = await dispatchEvent(
    { store: createSupabaseWebhookStore(admin) },
    config,
    envelope
  );
  return NextResponse.json({
    dispatched: delivery.status === "delivered",
    state: "connected",
    status: delivery.status,
    deliveryId: delivery.id,
    ...(delivery.status === "failed"
      ? { note: `Delivery failed (${delivery.last_error ?? "unknown error"}); it is queued for retry by the jobs worker.` }
      : {}),
  });
}
