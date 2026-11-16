import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface MuseActivityEntry {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

/**
 * GET /api/muse/activity — the signed-in user's workspace Muse
 * activity history: audit_logs rows for Muse events (MCP tool calls
 * `muse.tool.*` and OAuth events `MUSE_OAUTH_*`), newest first,
 * capped at 50. Live Supabase session required (401 without one);
 * Demo Mode refuses (503). No token, code or secret material is
 * ever stored in these rows, so none can leak here — only the
 * action, resource label and plain-language detail.
 */
export async function GET() {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "Muse activity is unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data, error } = await ctx.admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .or("action.ilike.muse.%,action.ilike.MUSE_OAUTH%")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // audit_logs or the Muse tables may not exist yet on a project
      // that has not applied the migrations — report honestly.
      return NextResponse.json(
        { error: `Failed to load Muse activity: ${error.message}` },
        { status: 500 }
      );
    }
    const entries: MuseActivityEntry[] = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const metadata =
        r.metadata && typeof r.metadata === "object"
          ? (r.metadata as Record<string, unknown>)
          : {};
      return {
        action: String(r.action ?? "UNKNOWN"),
        resource: (r.resource as string | null) ?? null,
        details:
          typeof metadata.details === "string" ? metadata.details : "",
        created_at: String(r.created_at ?? new Date().toISOString()),
      };
    });
    return NextResponse.json({ mode: ctx.mode, entries });
  } catch (err) {
    console.error("[Muse] Activity load failed:", err);
    return NextResponse.json(
      { error: "Failed to load Muse activity." },
      { status: 500 }
    );
  }
}
