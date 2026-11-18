import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { requireSuperAdminApi } from "@/lib/admin/server-auth";
import {
  setProviderDisabled,
  validateDisableToggle,
} from "@/lib/admin/integration-monitoring";
import { getProviderDefinition } from "@/lib/integrations/providers/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/integrations/monitoring/[provider]/disable —
 * platform SUPER-ADMIN provider disable switch (Wave 2, Phase 2).
 *
 * Body: { "disabled": true | false, "reason"?: string (≤500 chars) }.
 * A disabled provider is recorded in `provider_disabled_flags`
 * (migration 038) and an audit-log entry (`ADMIN_PROVIDER_DISABLED`
 * / `ADMIN_PROVIDER_ENABLED`) is written with the actor and reason.
 *
 * Gate: a signed-in `super_admin` session is required — regular
 * admins get 403, unauthenticated callers 401. Demo mode has no
 * session and no table to persist to, so it refuses with 503
 * instead of pretending the toggle saved.
 *
 * Enforcement scope (honest): this route stores the flag and the
 * monitoring pages display it. `assertProviderEnabled()` in
 * src/lib/admin/integration-monitoring.ts is the check the
 * connection / REST entry points must call — those call sites are
 * outside this wave's file set and are NOT wired yet, so until
 * they land a disabled provider still accepts connections. The
 * toggle never claims otherwise.
 */
export async function POST(
  request: Request,
  { params }: { params: { provider: string } }
) {
  const providerId = params.provider;
  const def = getProviderDefinition(providerId);
  if (!def) {
    return NextResponse.json(
      { error: `Unknown provider: ${providerId}` },
      { status: 404 }
    );
  }

  if (getDataMode() === "demo") {
    return NextResponse.json(
      {
        error:
          "Demo Mode has no super-admin session and no flag table — the provider disable switch needs a live deployment with migration 038 applied.",
      },
      { status: 503 }
    );
  }

  const gate = await requireSuperAdminApi();
  if ("response" in gate) return gate.response;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  const validated = validateDisableToggle(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const flag = await setProviderDisabled(admin, {
      providerId,
      disabled: validated.disabled,
      reason: validated.reason,
      actorId: gate.caller.id,
      actorEmail: gate.caller.email,
    });
    return NextResponse.json({
      provider: flag.provider,
      disabled: flag.disabled,
      disabledBy: flag.disabledBy,
      disabledAt: flag.disabledAt,
      reason: flag.reason,
      enforcementNote:
        "Flag stored. Enforcement: the shared REST auth gate checks this flag, so a disabled automation platform (Zapier, n8n, Make, Pabbly, Albato, Activepieces) refuses every REST API call with 503 provider_disabled. Other providers' flags are recorded but their connect flow is not yet gated.",
    });
  } catch (err) {
    console.error("[Admin] Provider disable toggle failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save the provider flag.",
      },
      { status: 503 }
    );
  }
}
