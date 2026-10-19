import { NextRequest, NextResponse } from "next/server";
import {
  listAdminLeads,
  resolveAdminGate,
  summarizeCrm,
} from "@/lib/admin/platform-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leads — Admin → Leads (cross-workspace, read-only,
 * tenant-labelled). With ?view=crm it returns the CRM summary
 * (lists/tags/segments aggregation) instead of the raw rows.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  try {
    const leads = await listAdminLeads(gate.mode);
    if (request.nextUrl.searchParams.get("view") === "crm") {
      return NextResponse.json({
        mode: gate.mode,
        summary: summarizeCrm(leads),
      });
    }
    return NextResponse.json({ mode: gate.mode, leads });
  } catch (err) {
    console.error("[Admin] Failed to load leads:", err);
    return NextResponse.json(
      { error: "Failed to load leads" },
      { status: 500 }
    );
  }
}
