import { NextResponse } from "next/server";
import { resolveAdminGate } from "@/lib/admin/platform-server";
import { createAdminClient } from "@/lib/supabase/server";
import { countActiveMuseGrants } from "@/lib/muse-connector/grants";
import {
  isMuseMcpEnabled,
  getMusePublicUrl,
} from "@/lib/muse-connector/oauth/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface AdminMuseToolCount {
  tool: string;
  calls: number;
}

export interface AdminMuseEvent {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

/**
 * GET /api/admin/muse — platform-admin Muse overview (behind
 * resolveAdminGate; demo mode returns labelled zeros).
 *
 * Live mode reads, through the service role only:
 *   - active grant count (distinct client + user pairs with a live
 *     refresh token; null when the migration 023 tables cannot be
 *     read, reported as `grantCount: null` = unknown, never zero);
 *   - MCP tool-call counts from audit_logs (`muse.tool.*` actions);
 *   - recent Muse errors: Muse audit entries whose detail mentions
 *     a failure/denial, plus OAuth denies — labelled as what they
 *     are (a text match over audit details, not a structured error
 *     flag, because audit rows carry no error column);
 *   - the 10 most recent Muse audit entries.
 *
 * No token, code, secret or message-body material is ever stored in
 * these rows, so none can leak here — only action names, resource
 * labels and plain-language details.
 */
export async function GET() {
  const gate = await resolveAdminGate();
  if ("response" in gate) return gate.response;

  if (gate.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      mcpEnabled: isMuseMcpEnabled(),
      publicUrl: getMusePublicUrl(),
      grantCount: 0,
      toolCounts: [] as AdminMuseToolCount[],
      recentErrors: [] as AdminMuseEvent[],
      recentEvents: [] as AdminMuseEvent[],
      note: "Demo Mode: the Muse OAuth + MCP surface is unavailable — no grants or tool calls exist.",
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured on the server." },
      { status: 503 }
    );
  }

  const grantCount = await countActiveMuseGrants(admin, {});

  let toolCounts: AdminMuseToolCount[] = [];
  let recentErrors: AdminMuseEvent[] = [];
  let recentEvents: AdminMuseEvent[] = [];
  try {
    const { data, error } = await admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .or("action.ilike.muse.%,action.ilike.MUSE_OAUTH%")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error) {
      const counts = new Map<string, number>();
      const errors: AdminMuseEvent[] = [];
      const events: AdminMuseEvent[] = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const metadata =
          r.metadata && typeof r.metadata === "object"
            ? (r.metadata as Record<string, unknown>)
            : {};
        const details =
          typeof metadata.details === "string" ? metadata.details : "";
        const entry: AdminMuseEvent = {
          action: String(r.action ?? "UNKNOWN"),
          resource: (r.resource as string | null) ?? null,
          details,
          created_at: String(r.created_at ?? new Date().toISOString()),
        };
        if (entry.action.startsWith("muse.tool.")) {
          const tool = entry.action.slice("muse.tool.".length);
          counts.set(tool, (counts.get(tool) ?? 0) + 1);
        }
        const detailLower = details.toLowerCase();
        if (
          entry.action === "MUSE_OAUTH_DENY" ||
          detailLower.includes("fail") ||
          detailLower.includes("error") ||
          detailLower.includes("denied") ||
          detailLower.includes("refused")
        ) {
          errors.push(entry);
        }
        events.push(entry);
      }
      toolCounts = Array.from(counts, ([tool, calls]) => ({ tool, calls })).sort(
        (a, b) => b.calls - a.calls
      );
      recentErrors = errors.slice(0, 10);
      recentEvents = events.slice(0, 10);
    }
  } catch (err) {
    console.error("[Admin] Muse stats audit read failed:", err);
  }

  return NextResponse.json({
    mode: gate.mode,
    mcpEnabled: isMuseMcpEnabled(),
    publicUrl: getMusePublicUrl(),
    grantCount,
    toolCounts,
    recentErrors,
    recentEvents,
  });
}
