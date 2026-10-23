import { NextRequest } from "next/server";
import {
  listSupportAgents,
  updateSupportAgent,
} from "@/lib/support/admin-service";
import { readJsonBody, withSupportAdmin } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/agents — every admin/super-admin profile
 * with its support-agent state (enabled, DECLARED availability,
 * computed eligibility). Availability is the agent's own toggle —
 * not presence tracking.
 * PUT { profile_id, enabled?, availability? } — enabling/disabling
 * agents is super admin only; an agent may set their OWN
 * availability.
 */
export async function GET() {
  return withSupportAdmin(({ store, actor, permissions }) =>
    listSupportAgents(store, actor, permissions)
  );
}

export async function PUT(request: NextRequest) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return withSupportAdmin(({ store, actor, permissions }) =>
    updateSupportAgent(store, actor, permissions, {
      profile_id: parsed.value.profile_id,
      enabled: parsed.value.enabled,
      availability: parsed.value.availability,
    })
  );
}
