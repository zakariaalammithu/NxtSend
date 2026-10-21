/**
 * Server transcription — OpenAI Whisper (P6 Stage C).
 *
 * POST /api/voice/transcribe accepts a recorded audio clip
 * (multipart form: `audio` file + optional `language`) and returns a
 * transcript produced by OpenAI's /v1/audio/transcriptions endpoint
 * (model `whisper-1`, overridable via OPENAI_TRANSCRIBE_MODEL).
 *
 * State honesty, mirroring the AI draft routes:
 *  - Demo Mode → 503: demo transcription would be fake; the client's
 *    browser dictation (when the browser has it) is the demo path and
 *    is labelled as the browser's engine, never as Whisper.
 *  - OPENAI_API_KEY unset → 503 with a plain "not configured" body.
 *  - Live mode without a session → 401.
 * Whisper is OpenAI-only: Anthropic / Meta keys do NOT enable it, and
 * the state function says exactly which key is missing.
 */

import { isConfiguredValue } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { voiceLanguagePrimarySubtag } from "./languages";
import { MAX_VOICE_NOTE_BYTES } from "./attachments";

export type FetchFn = typeof fetch;

export interface TranscribeDeps {
  env?: Record<string, string | undefined>;
  mode?: DataMode;
  user?: { id: string } | null;
  fetchFn?: FetchFn;
}

export interface TranscribeOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

export const TRANSCRIBE_NOT_CONFIGURED_MESSAGE =
  "Server transcription is not configured: OPENAI_API_KEY is not set, so Whisper transcription is unavailable. Browser dictation (where the browser supports it) still works.";

export const TRANSCRIBE_DEMO_MESSAGE =
  "Server transcription is unavailable in Demo Mode — nothing is uploaded. Use browser dictation if your browser offers it.";

export async function handleTranscribeRequest(
  deps: TranscribeDeps,
  form: { audio: Blob | null; filename?: string; language?: string }
): Promise<TranscribeOutcome> {
  const env = deps.env ?? process.env;
  const mode = deps.mode ?? getDataMode();

  if (mode !== "demo" && !deps.user) {
    return {
      httpStatus: 401,
      body: { status: "unauthenticated", transcript: null, message: "Authentication required." },
    };
  }
  if (mode === "demo") {
    return {
      httpStatus: 503,
      body: { status: "demo", transcript: null, message: TRANSCRIBE_DEMO_MESSAGE },
    };
  }

  // Whisper needs the OpenAI key specifically — any other provider
  // being configured does not change that.
  if (!isConfiguredValue(env.OPENAI_API_KEY)) {
    return {
      httpStatus: 503,
      body: {
        status: "not_configured",
        transcript: null,
        message: TRANSCRIBE_NOT_CONFIGURED_MESSAGE,
      },
    };
  }

  if (!form.audio) {
    return {
      httpStatus: 400,
      body: { status: "invalid_request", transcript: null, message: "No audio file was provided." },
    };
  }
  if (form.audio.size === 0) {
    return {
      httpStatus: 400,
      body: { status: "invalid_request", transcript: null, message: "The audio file is empty." },
    };
  }
  if (form.audio.size > MAX_VOICE_NOTE_BYTES) {
    return {
      httpStatus: 413,
      body: {
        status: "invalid_request",
        transcript: null,
        message: `The audio file is too large (limit ${MAX_VOICE_NOTE_BYTES / (1024 * 1024)} MB).`,
      },
    };
  }
  const audioType = form.audio.type || "audio/webm";
  if (!audioType.startsWith("audio/")) {
    return {
      httpStatus: 400,
      body: {
        status: "invalid_request",
        transcript: null,
        message: `Only audio files can be transcribed (got "${audioType}").`,
      },
    };
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const model = env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  const fd = new FormData();
  fd.append("file", form.audio, form.filename || "voice-note.webm");
  fd.append("model", model);
  if (form.language) {
    fd.append("language", voiceLanguagePrimarySubtag(form.language));
  }
  fd.append("response_format", "json");

  try {
    const res = await fetchFn("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: fd,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        httpStatus: 502,
        body: {
          status: "error",
          transcript: null,
          message: `Whisper transcription failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}. Nothing was transcribed.`,
        },
      };
    }
    const json = (await res.json()) as { text?: string };
    const transcript = (json.text ?? "").trim();
    if (!transcript) {
      return {
        httpStatus: 502,
        body: {
          status: "error",
          transcript: null,
          message: "Whisper returned an empty transcript (the clip may contain no speech).",
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        status: "ok",
        engine: "whisper",
        provider: "openai",
        transcript,
        message: "Transcribed by OpenAI Whisper. Review the text before sending.",
      },
    };
  } catch (err) {
    return {
      httpStatus: 502,
      body: {
        status: "error",
        transcript: null,
        message: `Whisper transcription failed: ${err instanceof Error ? err.message : "network error"}. Nothing was transcribed.`,
      },
    };
  }
}
