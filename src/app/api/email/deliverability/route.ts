/**
 * Workspace deliverability aggregates — GET /api/email/deliverability
 * (P5 Stage D).
 *
 * The read path over `email_events` (service-role-only, migration
 * 004). Guards mirror the other workspace APIs (resolveCenterContext):
 * demo mode serves the labelled demo workspace's SIMULATED derivation;
 * live mode requires a session, and the workspace is resolved from
 * the session server-side — a workspace id is never taken from the
 * request. Live reads go through the service-role client but are
 * scoped to that workspace in the loader (events count only when
 * their provider message ID belongs to a message in the workspace).
 *
 * Query: ?days=30 (default) — the aggregation window, clamped to
 * [1, 3650]. Response carries the classification ("provider" |
 * "simulated") so the UI never presents demo numbers as provider data.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import {
  clampDays,
  loadDemoWorkspaceDeliverability,
  loadWorkspaceDeliverability,
} from "@/lib/email/deliverability-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  const days = clampDays(new URL(req.url).searchParams.get("days"));

  try {
    if (ctx.mode === "demo") {
      const data = await loadDemoWorkspaceDeliverability(days);
      return NextResponse.json({ mode: ctx.mode, ...data });
    }
    if (!ctx.admin) {
      return NextResponse.json(
        {
          error:
            "Deliverability is unavailable: the service role is not configured, and the provider event log cannot be read without it.",
        },
        { status: 503 }
      );
    }
    const data = await loadWorkspaceDeliverability(ctx.admin, ctx.workspaceId, days);
    return NextResponse.json({ mode: ctx.mode, ...data });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load deliverability.",
      },
      { status: 500 }
    );
  }
}
