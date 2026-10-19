import { NextResponse } from "next/server";
import {
  getEnvPresence,
  getSystemHealth,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — Admin → System → System Health (+ the env
 * presence matrix reused by Development Diagnostics and Configure
 * Secrets). The overall verdict comes from aggregateHealth(): a
 * failed REQUIRED check can never yield "Healthy". Env data is names
 * + presence booleans only — values never leave the server.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const summary = await getSystemHealth(gate.mode);
    return NextResponse.json({
      mode: gate.mode,
      ...summary,
      env: getEnvPresence(),
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Admin] Health check failed:", err);
    return NextResponse.json(
      { error: "Failed to run health checks" },
      { status: 500 }
    );
  }
}
