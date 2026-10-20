/**
 * Mark notifications read — POST /api/notifications/read (P5 Stage D).
 *
 * Body: { id } marks one notification read; { all: true } marks the
 * whole workspace list read. Same guard + store resolution as
 * GET /api/notifications; the store always filters by the caller's
 * workspace, so an id from another workspace simply reports
 * `marked: false` — it can never be read-marked across tenants.
 */

import { NextResponse } from "next/server";
import { resolveNotificationStore } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const resolved = await resolveNotificationStore();
  if (!resolved.ok) return resolved.response;

  let body: { id?: unknown; all?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; all?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.all === true) {
      const count = await resolved.store.markAllRead(resolved.workspaceId);
      return NextResponse.json({ marked: count });
    }
    if (typeof body.id === "string" && body.id) {
      const marked = await resolved.store.markRead(
        resolved.workspaceId,
        body.id
      );
      return NextResponse.json({ marked });
    }
    return NextResponse.json(
      { error: "Provide { id } or { all: true }." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to mark notifications read.",
      },
      { status: 500 }
    );
  }
}
