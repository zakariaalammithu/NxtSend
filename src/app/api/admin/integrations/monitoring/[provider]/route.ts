import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { requireSuperAdminApi } from "@/lib/admin/server-auth";
import {
  demoMonitoringOverview,
  getProviderMonitoringDetail,
} from "@/lib/admin/integration-monitoring";
import { getProviderDefinition } from "@/lib/integrations/providers/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/integrations/monitoring/[provider] — platform
 * SUPER-ADMIN per-provider monitoring detail (Wave 2, Phase 2).
 *
 * Same gate as the overview (super_admin session; demo mode serves
 * the labelled empty detail). The response is the overview row for
 * the provider plus its underlying records, newest first:
 * stored connections (safe columns only — never the encrypted
 * credential blob), audit entries (only for providers with a real
 * audit prefix; empty otherwise, with `auditNote` saying why),
 * webhook deliveries (six REST platforms only), sync jobs (last 7d)
 * and usage events (last 7d). Empty lists are honest empty states:
 * "no rows recorded", never invented activity.
 */
export async function GET(
  _request: Request,
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
    const overview = demoMonitoringOverview();
    const provider = overview.providers.find((p) => p.id === providerId);
    return NextResponse.json({
      mode: "demo",
      provider,
      connections: [],
      audit: [],
      deliveries: [],
      syncJobs: [],
      usage: [],
      note: "Demo Mode: no live provider data exists — this detail is a labelled empty state.",
    });
  }

  const gate = await requireSuperAdminApi();
  if ("response" in gate) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const detail = await getProviderMonitoringDetail(admin, providerId);
    if (!detail) {
      return NextResponse.json(
        { error: `Unknown provider: ${providerId}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ mode: "supabase", ...detail });
  } catch (err) {
    console.error("[Admin] Provider monitoring detail failed:", err);
    return NextResponse.json(
      { error: "Failed to load provider monitoring." },
      { status: 500 }
    );
  }
}
