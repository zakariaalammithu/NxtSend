import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveInboxContext } from "@/lib/server/inbox";
import { uploadVoiceNote } from "@/lib/voice/storage";
import { voiceNoteFilename } from "@/lib/voice/attachments";

/**
 * POST /api/voice/upload
 *
 * Live-mode voice-note upload. The client posts the recorded clip
 * (multipart form field `audio`); the server stores it in the
 * private `voice-notes` bucket under the CALLER's workspace path
 * (`<workspace_id>/<note_id>/<filename>`) via the service role and
 * returns the path. The workspace is resolved from the session
 * server-side — a client can never choose another workspace's path.
 *
 * Demo Mode: 400 — demo recordings stay in the browser (data URLs in
 * the demo store); nothing is uploaded anywhere, by design.
 */
export async function POST(req: Request) {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  if (ctx.mode === "demo") {
    return NextResponse.json(
      {
        error:
          "Demo Mode keeps recordings in your browser — uploads are a live-mode path and nothing was uploaded.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing). The voice note was not uploaded." },
      { status: 503 }
    );
  }

  let file: Blob | null = null;
  try {
    const form = await req.formData();
    const raw = form.get("audio");
    if (raw instanceof Blob) file = raw;
  } catch {
    file = null;
  }
  if (!file) {
    return NextResponse.json(
      { error: "No audio file was provided." },
      { status: 400 }
    );
  }
  const contentType = file.type || "audio/webm";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadVoiceNote(admin, {
    workspaceId: ctx.workspaceId,
    noteId: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    filename: (file as File).name || voiceNoteFilename(contentType),
    contentType,
    bytes,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
