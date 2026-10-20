/**
 * Admin warm-up configuration — GET /api/admin/warmup (P5 Stage E).
 *
 * Platform scope, behind the standard admin gate (resolveAdminGate).
 * Reports ONLY configuration facts about the email warm-up provider
 * (Instantly): which provider, whether its credential is configured
 * (boolean — the value is never returned), the derived state, and the
 * most recent recorded Test Connection outcome (migration 006
 * verification store, provider "instantly_warmup").
 *
 * Warm-up itself runs entirely on the provider's network; there is no
 * warm-up activity data at platform scope here — per-mailbox status is
 * the workspace surface at GET /api/email/warmup.
 */

import { NextResponse } from "next/server";
import {
  adminClientOr503,
  resolveAdminGate,
} from "@/lib/admin/platform-server";
import { PROVIDER_STATE_LABELS } from "@/lib/env";
import { providerForIntegration } from "@/lib/integrations-center/verification-store";
import { createWarmupAdapter } from "@/lib/warmup";
import { isWarmupConfigured } from "@/lib/warmup/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LastVerification {
  ok: boolean;
  checkedAt: string;
  message: string;
  workspaceId: string;
}

export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  const adapter = createWarmupAdapter();
  const state = adapter.getState();
  const configured = isWarmupConfigured();

  let lastVerification: LastVerification | null = null;
  if (gate.mode !== "demo") {
    const admin = adminClientOr503();
    if (admin instanceof NextResponse) return admin;
    const provider = providerForIntegration("warmup");
    if (provider) {
      const { data } = await admin
        .from("integrations")
        .select(
          "workspace_id, last_verified_at, last_verification_status, last_verification_message"
        )
        .eq("provider", provider)
        .not("last_verified_at", "is", null)
        .order("last_verified_at", { ascending: false })
        .limit(1);
      const row = (data ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      if (row && row.last_verification_status) {
        lastVerification = {
          ok: row.last_verification_status === "verified",
          checkedAt: String(row.last_verified_at),
          message: String(row.last_verification_message ?? ""),
          workspaceId: String(row.workspace_id),
        };
      }
    }
  }

  return NextResponse.json({
    mode: gate.mode,
    provider: adapter.provider,
    providerLabel: adapter.providerLabel,
    configured,
    state,
    stateLabel: PROVIDER_STATE_LABELS[state],
    envVar: "INSTANTLY_API_KEY",
    lastVerification,
  });
}
