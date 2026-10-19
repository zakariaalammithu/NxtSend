import { NextResponse } from "next/server";
import {
  getAdminNotifications,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/notifications — Admin → Notifications. Derived at
 * read time from real sources (recent audit entries, failed job runs,
 * failed webhook deliveries), each item labelled with its source.
 * Nothing is stored or fabricated.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const notifications = await getAdminNotifications(gate.mode);
    return NextResponse.json({ mode: gate.mode, notifications });
  } catch (err) {
    console.error("[Admin] Failed to load notifications:", err);
    return NextResponse.json(
      { error: "Failed to load notifications" },
      { status: 500 }
    );
  }
}
