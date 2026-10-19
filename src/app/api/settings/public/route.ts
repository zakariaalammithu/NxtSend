import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/public — the safe public subset of the platform
 * settings (site name, whether signups are open, whether the demo
 * banner is enabled). Consumed by the signup page (signup gate) and
 * the dashboard chrome (demo notice visibility).
 *
 * Only these three non-sensitive settings fields are ever returned
 * (plus the data-mode label every API response carries) — the full
 * settings record requires the admin gate (see /api/admin/settings).
 */
export async function GET() {
  const settings = await getPublicSettings();
  return NextResponse.json(settings);
}
