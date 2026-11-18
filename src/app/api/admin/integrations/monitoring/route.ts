import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { requireSuperAdminApi } from "@/lib/admin/server-auth";
import {
  demoMonitoringOverview,
  getProviderMonitoring,
} from "@/lib/admin/integration-monitoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/integrations/monitoring — platform SUPER-ADMIN
 * provider-monitoring overview (Wave 2, Phase 2).
 *
 * Live mode requires a session whose profile role is `super_admin`
 * (regular admins get 403); demo mode returns the labelled empty
 * overview (all 69 providers, zeroed counts, no data claimed).
 *
 * Live mode reads, through the service role only, one query per
 * source table and aggregates in memory:
 *   - `integration_connections` (migration 030) — safe columns
 *     only; the encrypted credential blob is never selected;
 *   - `audit_logs` (`muse.tool.*`, `zapier.*`, `n8n.*`, `make.*`,
 *     `pabbly.*`, `albato.*`, `activepieces.*` — last 7d) for API
 *     calls / errors. ChatGPT/Claude share the `muse.tool.*`
 *     prefix and cannot be split out; the 60+ adapters write no
 *     audit rows, so their counts are null (not recorded), never
 *     invented zeros;
 *   - `zapier_webhook_subscriptions` / `zapier_webhook_deliveries`
 *     (migrations 025/029/031) — safe columns only (no HMAC secret,
 *     no payload), for the six REST platforms only;
 *   - `integration_sync_jobs` + `integration_usage` (migration
 *     030) — last 7d;
 *   - `provider_disabled_flags` (migration 038) — the disable
 *     switch state per provider.
 *
 * A table that cannot be read (migration not applied) is listed in
 * `unknownTables` and its numbers stay null — unknown, never zero.
 */
export async function GET() {
  if (getDataMode() === "demo") {
    const overview = demoMonitoringOverview();
    return NextResponse.json({
      mode: "demo",
      ...overview,
      note: "Demo Mode: no live provider data exists — all counts are labelled zeros and no provider is shown as connected.",
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
    const overview = await getProviderMonitoring(admin);
    return NextResponse.json({ mode: "supabase", ...overview });
  } catch (err) {
    console.error("[Admin] Provider monitoring overview failed:", err);
    return NextResponse.json(
      { error: "Failed to load provider monitoring." },
      { status: 500 }
    );
  }
}
