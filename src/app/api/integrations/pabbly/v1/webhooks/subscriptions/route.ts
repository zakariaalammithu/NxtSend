import { withRestRoute } from "@/lib/integrations/rest/route-helpers";
import { PABBLY_PLATFORM } from "@/lib/integrations/rest/config";
import { restListWebhookSubscriptions } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /v1/webhooks/subscriptions — active subscriptions for the workspace (secrets never included). */
export async function GET(req: Request) {
  return withRestRoute(req, PABBLY_PLATFORM, "read", (ctx, deps) =>
    restListWebhookSubscriptions(ctx, deps)
  );
}
