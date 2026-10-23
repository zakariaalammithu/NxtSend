import { NextRequest } from "next/server";
import {
  getSupportSettings,
  updateSupportSettings,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/settings — the support settings singleton
 * plus the AI enhancement's real provider state. Super admin only.
 * PUT — update settings (partial). Every field drives real widget /
 * pipeline behaviour: ai_kb_enabled=false means the bot never
 * answers from the KB; live_support_enabled=false blocks
 * escalation; display name/copy is what visitors see.
 */
export async function GET() {
  return withSupportAdmin(({ store, actor, permissions }) =>
    getSupportSettings(store, actor, permissions)
  );
}

export async function PUT(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportSettings(store, actor, permissions, parsed.value)
  );
}
