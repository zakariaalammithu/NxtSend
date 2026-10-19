import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import {
  resolveWebhookCaller,
  isWorkspaceAdmin,
  getDemoWebhookConfig,
  setDemoWebhookConfig,
} from "@/lib/webhooks/server";
import {
  publicWebhookConfig,
  getWebhookState,
  validateWebhookUrl,
  type WebhookConfig,
} from "@/lib/webhooks/config";
import { WEBHOOK_EVENT_TYPES, isWebhookEventType } from "@/lib/webhooks/events";
import {
  getWorkspaceWebhookConfig,
  saveWorkspaceWebhookConfig,
  createSupabaseWebhookStore,
} from "@/lib/webhooks/store";
import { getDemoWebhookStore } from "@/lib/webhooks/dispatch";

/**
 * GET  /api/webhooks/config — state + public config + recent deliveries.
 *      The signing secret is NEVER returned here. Workspace members see
 *      the state only; owners/admins also see the URL and delivery log.
 * POST /api/webhooks/config — owners/admins set the subscription URL /
 *      events / enabled flag. A signing secret is generated server-side
 *      on first save and returned exactly once (in this response) so the
 *      operator can configure verification on their receiver.
 */

export async function GET() {
  const resolved = await resolveWebhookCaller();
  if ("response" in resolved) return resolved.response;
  const { caller } = resolved;

  if (caller.mode === "demo") {
    const config = getDemoWebhookConfig();
    const deliveries = await getDemoWebhookStore().listDeliveries(caller.workspaceId);
    return NextResponse.json({
      state: "demo",
      config: publicWebhookConfig(config),
      deliveries: deliveries.map(publicDelivery),
      note: "Demo Mode: the subscription is held in server memory and deliveries are simulated — no endpoint is ever called.",
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
  const state = getWebhookState(config);
  if (!isWorkspaceAdmin(caller.role)) {
    return NextResponse.json({
      state,
      config: { url: null, events: [], enabled: false, hasSecret: false },
      deliveries: [],
      note: "Only workspace owners/admins can view or change webhook settings.",
    });
  }
  const deliveries = await createSupabaseWebhookStore(admin).listDeliveries(caller.workspaceId);
  return NextResponse.json({
    state,
    config: publicWebhookConfig(config),
    deliveries: deliveries.map(publicDelivery),
  });
}

export async function POST(req: Request) {
  const resolved = await resolveWebhookCaller();
  if ("response" in resolved) return resolved.response;
  const { caller } = resolved;

  let body: { url?: unknown; events?: unknown; enabled?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urlCheck = validateWebhookUrl(typeof body.url === "string" ? body.url : "");
  if (!urlCheck.ok) {
    return NextResponse.json({ error: urlCheck.error }, { status: 400 });
  }
  const events = Array.isArray(body.events)
    ? body.events.filter(isWebhookEventType)
    : [...WEBHOOK_EVENT_TYPES];
  const enabled = body.enabled !== false;

  if (caller.mode === "demo") {
    const existing = getDemoWebhookConfig();
    const secret = existing?.secret ?? generateSecret();
    const config: WebhookConfig = { url: urlCheck.url, secret, events, enabled };
    setDemoWebhookConfig(config);
    return NextResponse.json({
      state: "demo",
      config: publicWebhookConfig(config),
      ...(existing ? {} : { secret, secretNote: "Shown once — store it in your receiver to verify signatures. In Demo Mode it lives only in server memory." }),
      note: "Demo Mode: saved in server memory only; deliveries will be simulated, never sent.",
    });
  }

  if (!isWorkspaceAdmin(caller.role)) {
    return NextResponse.json(
      { error: "Forbidden: workspace owner/admin role required to change webhook settings." },
      { status: 403 }
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured.", state: "configuration_required" },
      { status: 503 }
    );
  }
  const existing = await getWorkspaceWebhookConfig(admin, caller.workspaceId);
  const secret = existing?.secret ?? generateSecret();
  const config: WebhookConfig = { url: urlCheck.url, secret, events, enabled };
  await saveWorkspaceWebhookConfig(admin, caller.workspaceId, config);
  return NextResponse.json({
    state: getWebhookState(config),
    config: publicWebhookConfig(config),
    ...(existing
      ? {}
      : { secret, secretNote: "Shown once — store it in your receiver (n8n/Zapier/custom) to verify the X-NxtSend-Signature header. It will not be shown again." }),
  });
}

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

function publicDelivery(d: {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}) {
  return {
    id: d.id,
    event_type: d.event_type,
    status: d.status,
    attempts: d.attempts,
    last_error: d.last_error,
    created_at: d.created_at,
  };
}
