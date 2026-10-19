import { NextRequest, NextResponse } from "next/server";
import {
  listAuditEntries,
  resolveAdminGate,
} from "@/lib/admin/platform-server";
import type { AuditFilters } from "@/lib/admin/audit-core";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-logs?action=&actor=&from=&to=&search=
 *
 * Reads the REAL audit substrate: the audit_logs table that admin API
 * routes write (user suspend/activate, settings changes, bootstrap) —
 * replacing the old Audit page's bundled mock array, which never
 * contained a single entry the APIs actually wrote. Demo Mode serves
 * the labelled demo store (seeded sample entries + anything the demo
 * admin does in this process, e.g. settings changes).
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  const params = request.nextUrl.searchParams;
  const filters: AuditFilters = {
    action: params.get("action") ?? undefined,
    actor: params.get("actor") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    search: params.get("search") ?? undefined,
  };

  try {
    const entries = await listAuditEntries(gate.mode, filters);
    return NextResponse.json({ mode: gate.mode, entries });
  } catch (err) {
    console.error("[Admin] Failed to load audit logs:", err);
    return NextResponse.json(
      { error: "Failed to load audit logs" },
      { status: 500 }
    );
  }
}
