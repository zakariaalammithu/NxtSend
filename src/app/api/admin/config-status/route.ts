import { NextResponse } from "next/server";
import { resolveAdminGate } from "@/lib/admin/platform-server";
import { getConfigStatus } from "@/lib/config-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/config-status — Admin → System → Diagnostics (and the
 * data source a future System Health widget can share).
 *
 * Returns the full .env.example configuration matrix: every variable
 * classified as present_valid / present_placeholder / missing,
 * grouped by feature. Gate: resolveAdminGate — in live mode that IS
 * requireAdminApi (profiles-row admin check); in Demo Mode it answers
 * with mode "demo" like the other Stage-D diagnostics routes so the
 * page can render the (mostly missing) matrix honestly.
 *
 * Values are NEVER included — names, classifications and purposes
 * only. A secret's value cannot leak through this route by
 * construction: the classifier's output is an enum, not the input.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  const matrix = getConfigStatus();
  return NextResponse.json({
    mode: gate.mode,
    ...matrix,
    generatedAt: new Date().toISOString(),
    notes: [
      "Classification is presence + placeholder-shape only (src/lib/config-status.ts); a variable marked present_valid has not been verified against its provider — use each integration's Test Connection for that.",
      "present_placeholder means the .env.example sample value is still in place; the feature treats it as unconfigured.",
    ],
  });
}
