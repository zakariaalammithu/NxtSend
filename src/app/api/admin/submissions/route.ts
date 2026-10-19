import { NextResponse } from "next/server";
import {
  listSubmissions,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/submissions — the Admin → Submissions inbox.
 * Gate: live mode requires an admin session (requireAdminApi ladder);
 * Demo Mode serves the labelled demo store (no session exists there).
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const submissions = await listSubmissions(gate.mode);
    return NextResponse.json({ mode: gate.mode, submissions });
  } catch (err) {
    console.error("[Admin] Failed to load submissions:", err);
    return NextResponse.json(
      { error: "Failed to load submissions" },
      { status: 500 }
    );
  }
}
