import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { handleTranscribeRequest } from "@/lib/voice/transcribe";

/**
 * POST /api/voice/transcribe
 *
 * Server transcription via OpenAI Whisper. Multipart form:
 * `audio` (the recorded clip) + optional `language` (BCP-47).
 * Honest states only: Demo Mode → 503 (nothing is uploaded), no
 * OPENAI_API_KEY → 503 not_configured, live without a session → 401.
 * The browser's own speech recognition remains the primary dictation
 * path where the browser offers it — this route is the fallback.
 */
export async function POST(req: Request) {
  const mode = getDataMode();
  let user: { id: string } | null = null;

  if (mode !== "demo") {
    const supabase = await createServerClient();
    if (supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) user = { id: authUser.id };
    }
  }

  let audio: Blob | null = null;
  let filename: string | undefined;
  let language: string | undefined;
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (file instanceof Blob) {
      audio = file;
      filename = (file as File).name || undefined;
    }
    const lang = form.get("language");
    if (typeof lang === "string" && lang) language = lang;
  } catch {
    audio = null;
  }

  const result = await handleTranscribeRequest(
    { mode, user },
    { audio, filename, language }
  );
  return NextResponse.json(result.body, { status: result.httpStatus });
}
