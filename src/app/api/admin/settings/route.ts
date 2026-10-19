import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSettings,
  resolveAdminGate,
  updateAdminSettings,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/admin/settings — platform settings (Admin → System
 * Settings + Emergency Controls + Campaign Settings all read/write
 * through here).
 *
 * Before this route the settings page kept values in React state and
 * its Save button persisted nothing. Now: GET returns the persisted
 * record; PUT validates server-side, persists (admin_settings table
 * in live mode; demo store in Demo Mode), and writes an audit_logs
 * entry naming the changed fields.
 *
 * Gate: live mode requires an admin session (requireAdminApi ladder);
 * Demo Mode has no sessions by design and serves the demo store.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  const settings = await getAdminSettings(gate.mode);
  return NextResponse.json({ mode: gate.mode, settings });
}

export async function PUT(request: NextRequest) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await updateAdminSettings({
      mode: gate.mode,
      body,
      actorId: gate.caller?.id ?? null,
      actorEmail: gate.caller?.email ?? "demo-admin",
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Validation failed", fields: result.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({
      mode: gate.mode,
      settings: result.settings,
      changed: result.changed,
    });
  } catch (err) {
    console.error("[Admin] Failed to save settings:", err);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
