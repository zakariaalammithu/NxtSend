import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import { activityActionFilter } from "@/lib/muse-connector/activity-filter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface MuseActivityEntry {
  action: string;
  resource: string | null;
  details: string;
  created_at: string;
}

/**
 * GET /api/muse/activity — the signed-in user's workspace activity
 * history: audit_logs rows for Muse events (MCP tool calls
 * `muse.tool.*` and OAuth events `MUSE_OAUTH_*`), newest first,
 * capped at 50. `?platform=zapier` returns only the Zapier REST
 * API's `zapier.*` entries instead (used by the Zapier panel);
 * `?platform=n8n` returns only the n8n REST API's `n8n.*`
 * entries (used by the n8n panel).
 * Live Supabase session required (401 without one); Demo Mode
 * refuses (503). No token, code or secret material is ever stored
 * in these rows, so none can leak here — only the action, resource
 * label and plain-language detail.
 */
export async function GET(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "Activity is unavailable in Demo Mode." },
      { status: 503 }
    );
  }
  if (!ctx.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const platform = new URL(req.url).searchParams.get("platform");
  const isZapier = platform === "zapier";
  const isN8n = platform === "n8n";
  const label = isZapier ? "Zapier" : isN8n ? "n8n" : "Muse";
  try {
    const { data, error } = await ctx.admin
      .from("audit_logs")
      .select("action, resource, metadata, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .or(activityActionFilter(platform))
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // audit_logs or the Muse tables may not exist yet on a project
      // that has not applied the migrations — report honestly.
      return NextResponse.json(
        { error: `Failed to load ${label} activity: ${error.message}` },
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
    console.error(`[${label}] Activity load failed:`, err);
    return NextResponse.json(
      { error: `Failed to load ${label} activity.` },
      { status: 500 }
    );
  }
}
