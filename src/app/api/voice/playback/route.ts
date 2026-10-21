import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveInboxContext } from "@/lib/server/inbox";
import {
  createVoicePlaybackUrl,
  isWorkspaceVoicePath,
} from "@/lib/voice/storage";

/**
 * GET /api/voice/playback?path=<workspace_id>/<note_id>/<file>
 *
 * Mints a short-lived signed URL for a stored voice note. The path's
 * first segment MUST be the caller's own workspace (resolved from
 * the session server-side) — any other workspace's path is refused
 * with 403 before storage is touched. Demo Mode paths are `data:`
 * URLs the client plays directly, so this route is live-only.
 */
export async function GET(req: Request) {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  if (ctx.mode === "demo") {
    return NextResponse.json(
      { error: "Demo Mode voice notes play directly from the browser — no signed URL is needed." },
      { status: 400 }
    );
  }
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!isWorkspaceVoicePath(ctx.workspaceId, path)) {
    return NextResponse.json(
      { error: "That voice note does not belong to your workspace." },
      { status: 403 }
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing)." },
      { status: 503 }
    );
  }
  const url = await createVoicePlaybackUrl(admin, path);
  if (!url) {
    return NextResponse.json(
      { error: "The voice note could not be found in storage." },
      { status: 404 }
    );
  }
  return NextResponse.json({ url });
}
