import { NextResponse } from "next/server";
import {
  getUsageOverview,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usage — Admin → Analytics → Usage & Credits.
 * Live mode: latest-period usage_records per workspace (written by
 * the usage_rollup job), with plan limits applied via checkLimit.
 * Demo Mode: the labelled demo seed. Quantities are always measured
 * records — never derived or estimated in the route.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const workspaces = await getUsageOverview(gate.mode);
    return NextResponse.json({ mode: gate.mode, workspaces });
  } catch (err) {
    console.error("[Admin] Failed to load usage overview:", err);
    return NextResponse.json(
      { error: "Failed to load usage overview" },
      { status: 500 }
    );
  }
}
