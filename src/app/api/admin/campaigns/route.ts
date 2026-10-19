import { NextResponse } from "next/server";
import {
  listAdminCampaigns,
  resolveAdminGate,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/campaigns — Admin → Campaigns: cross-workspace,
 * read-only campaign inspection for platform admins. Every row is
 * labelled with its workspace (tenant). Live mode reads through the
 * service role AFTER the admin gate — user-facing campaign reads keep
 * going through the workspace-scoped data layer, never this route.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const campaigns = await listAdminCampaigns(gate.mode);
    return NextResponse.json({ mode: gate.mode, campaigns });
  } catch (err) {
    console.error("[Admin] Failed to load campaigns:", err);
    return NextResponse.json(
      { error: "Failed to load campaigns" },
      { status: 500 }
    );
  }
}
