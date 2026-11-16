import { withZapierRoute } from "@/lib/integrations/zapier/route-helpers";
import { zapierListWebhookSubscriptions } from "@/lib/integrations/zapier/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/webhooks/subscriptions — active subscriptions for the workspace (secrets never included). */
export async function GET(req: Request) {
  return withZapierRoute(req, "read", (ctx, deps) =>
    zapierListWebhookSubscriptions(ctx, deps)
  );
}
