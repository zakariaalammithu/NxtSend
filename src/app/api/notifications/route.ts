/**
 * User notifications — GET /api/notifications (P5 Stage D).
 *
 * The stored notifications (migration 012) for the caller's
 * workspace, newest first, with the unread count the dashboard bell
 * badges. Guards mirror the other workspace APIs
 * (resolveCenterContext): demo mode serves the demo notification
 * store; live mode requires a session, resolves the workspace
 * server-side, and reads through the SESSION client so RLS scopes
 * rows on top of the explicit workspace filter.
 */

import { NextResponse } from "next/server";
import { resolveCenterContext } from "@/lib/integrations-center/server";
import {
  createDemoNotificationStore,
  createSupabaseNotificationStore,
  type NotificationStore,
} from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function resolveNotificationStore(): Promise<
  | { ok: true; store: NotificationStore; workspaceId: string; mode: string }
  | { ok: false; response: NextResponse }
> {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return { ok: false, response: ctx.response };
  if (ctx.mode === "demo") {
    return {
      ok: true,
      store: createDemoNotificationStore(),
      workspaceId: ctx.workspaceId,
      mode: ctx.mode,
    };
  }
  if (!ctx.supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Database is not configured, so notifications are unavailable." },
        { status: 503 }
      ),
    };
  }
  return {
    ok: true,
    store: createSupabaseNotificationStore(ctx.supabase),
    workspaceId: ctx.workspaceId,
    mode: ctx.mode,
  };
}

export async function GET() {
  const resolved = await resolveNotificationStore();
  if (!resolved.ok) return resolved.response;
  try {
    const [notifications, unreadCount] = await Promise.all([
      resolved.store.list(resolved.workspaceId, 30),
      resolved.store.unreadCount(resolved.workspaceId),
    ]);
    return NextResponse.json({
      mode: resolved.mode,
      notifications,
      unreadCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load notifications.",
      },
      { status: 500 }
    );
  }
}
