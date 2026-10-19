import { NextResponse } from "next/server";
import {
  getQueueOverview,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/queue — Admin → System → Queue & Workers.
 * Live mode: real rows from jobs/job_runs (service role, admin gate).
 * Demo Mode: the labelled demo seed. CRON_SECRET is reported as a
 * presence boolean only.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const overview = await getQueueOverview(gate.mode);
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[Admin] Failed to load queue overview:", err);
    return NextResponse.json(
      { error: "Failed to load queue overview" },
      { status: 500 }
    );
  }
}
