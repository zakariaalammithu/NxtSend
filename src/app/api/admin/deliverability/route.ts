/**
 * Admin deliverability monitoring — GET /api/admin/deliverability
 * (P5 Stage D).
 *
 * Platform scope, behind the standard admin gate (resolveAdminGate):
 * demo mode serves the labelled demo derivation; live mode requires
 * an admin/super_admin session, after which reads span workspaces
 * through the service role (every row labelled with its workspace).
 *
 * Returns the delivery funnel + rates, the inbound webhook log
 * (including UNROUTED received mail), the sending-errors list and the
 * reply-sync status. Query: ?days=30 (default), clamped to [1, 3650].
 */

import { NextResponse } from "next/server";
import {
  adminClientOr503,
  resolveAdminGate,
} from "@/lib/admin/platform-server";
import {
  clampDays,
  loadDemoPlatformDeliverability,
  loadPlatformDeliverability,
} from "@/lib/email/deliverability-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  const days = clampDays(new URL(req.url).searchParams.get("days"));

  try {
    if (gate.mode === "demo") {
      const data = await loadDemoPlatformDeliverability(days);
      return NextResponse.json({ mode: gate.mode, ...data });
    }
    const admin = adminClientOr503();
    if (admin instanceof NextResponse) return admin;
    const data = await loadPlatformDeliverability(admin, days);
    return NextResponse.json({ mode: gate.mode, ...data });
  } catch (err) {
    console.error("[Admin] Failed to load deliverability:", err);
    return NextResponse.json(
      { error: "Failed to load deliverability" },
      { status: 500 }
    );
  }
}
