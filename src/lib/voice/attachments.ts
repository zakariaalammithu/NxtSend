/**
 * Voice-note attachment plumbing (P6 Stage C).
 *
 * A recorded voice note reaches an email in exactly one shape: an
 * `EmailAttachment` (base64 bytes + real content type + filename)
 * carried by SendEmailInput through Resend / Gmail / Graph. This
 * module owns the conversions and the safety caps:
 *  - MIME type → file extension (labelled with the REAL recorded type)
 *  - Blob → base64 (browser + Node paths)
 *  - data URL parse/build (demo storage + step-config storage)
 *  - the per-step voice-note config shape stored in step.config
 *
 * Caps: a single voice note may not exceed MAX_VOICE_NOTE_BYTES
 * (10 MB) — recordings are capped at 120 s in the recorder, which at
 * typical Opus bitrates is ~1 MB, so this only trips on abuse/bugs.
 */

import type { EmailAttachment } from "@/lib/email/types";

export const MAX_VOICE_NOTE_BYTES = 10 * 1024 * 1024;

/** MIME type → file extension for voice-note filenames. */
export function voiceFileExtension(contentType: string): string {
  const base = contentType.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "bin";
  }
}

export function voiceNoteFilename(contentType: string, when = new Date()): string {
  const stamp = when.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `voice-note-${stamp}.${voiceFileExtension(contentType)}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + CHUNK))
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Builds a data: URL for an audio payload (demo-mode storage). */
export function audioDataUrl(contentType: string, contentBase64: string): string {
  return `data:${contentType};base64,${contentBase64}`;
}

export interface ParsedDataUrl {
  contentType: string;
  contentBase64: string;
}

/** Parses a data: URL; returns null for anything that isn't one. */
export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const contentType = match[1];
  if (match[2]) {
    return { contentType, contentBase64: match[3] };
  }
  // Non-base64 data URL — re-encode so callers always get base64.
  try {
    return {
      contentType,
      contentBase64: bytesToBase64(new TextEncoder().encode(decodeURIComponent(match[3]))),
    };
  } catch {
    return null;
  }
}

export function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

/**
 * Validates + builds the EmailAttachment for a voice note. Returns a
 * discriminated result so callers can surface the exact problem
 * (oversized / not audio) instead of silently dropping the note.
 */
export function buildVoiceAttachment(input: {
  contentType: string;
  contentBase64: string;
  filename?: string;
}):
  | { ok: true; attachment: EmailAttachment }
  | { ok: false; error: string } {
  const contentType = input.contentType.split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("audio/")) {
    return {
      ok: false,
      error: `Voice notes must be audio files (got "${input.contentType}").`,
    };
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(input.contentBase64);
  } catch {
    return { ok: false, error: "The voice note audio could not be decoded." };
  }
  if (bytes.length === 0) {
    return { ok: false, error: "The voice note is empty." };
  }
  if (bytes.length > MAX_VOICE_NOTE_BYTES) {
    return {
      ok: false,
      error: `The voice note is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB — the limit is ${MAX_VOICE_NOTE_BYTES / (1024 * 1024)} MB. Record a shorter note.`,
    };
  }
  return {
    ok: true,
    attachment: {
      filename: input.filename ?? voiceNoteFilename(contentType),
      contentType,
      contentBase64: input.contentBase64,
    },
  };
}

/** Reads a Blob into base64 (used by the browser composer). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

// ── Per-step voice note (stored in CampaignStep.config.voice_note) ────────

/**
 * The voice note attached to a sequence step. Two storage shapes:
 *  - "data": the audio is inline as a data URL — Demo Mode (browser
 *    store) and any step composed before upload; executor decodes it
 *    directly.
 *  - "storage": the audio lives in the private `voice-notes` bucket
 *    at `path` — live mode; the executor resolves it through the
 *    injected resolver (server-side download) before sending.
 */
export interface StepVoiceNote {
  source: "data" | "storage";
  dataUrl?: string;
  path?: string;
  filename: string;
  contentType: string;
  durationSec: number;
  language: string;
  transcript?: string | null;
}

/** Tolerant parse of unknown step config into a StepVoiceNote. */
export function parseStepVoiceNote(raw: unknown): StepVoiceNote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = r.source === "storage" ? "storage" : r.source === "data" ? "data" : null;
  if (!source) return null;
  const contentType = typeof r.contentType === "string" ? r.contentType : "";
  if (!contentType.startsWith("audio/")) return null;
  const filename =
    typeof r.filename === "string" && r.filename ? r.filename : voiceNoteFilename(contentType);
  const durationSec =
    typeof r.durationSec === "number" && Number.isFinite(r.durationSec)
      ? Math.max(0, Math.round(r.durationSec))
      : 0;
  const language = typeof r.language === "string" ? r.language : "en-US";
  const transcript =
    typeof r.transcript === "string" ? r.transcript : null;
  if (source === "data") {
    if (typeof r.dataUrl !== "string" || !isDataUrl(r.dataUrl)) return null;
    return { source, dataUrl: r.dataUrl, filename, contentType, durationSec, language, transcript };
  }
  if (typeof r.path !== "string" || !r.path) return null;
  return { source, path: r.path, filename, contentType, durationSec, language, transcript };
}

/**
 * Resolves a step voice note to an email attachment. Data-source
 * notes resolve inline; storage-source notes need the injected
 * resolver (server download) — without one, resolution fails loudly
 * so the executor can log that the note was NOT attached.
 */
export async function resolveStepVoiceAttachment(
  note: StepVoiceNote,
  resolveStorage?: (path: string) => Promise<EmailAttachment | null>
): Promise<
  | { ok: true; attachment: EmailAttachment }
  | { ok: false; error: string }
> {
  if (note.source === "data" && note.dataUrl) {
    const parsed = parseDataUrl(note.dataUrl);
    if (!parsed) return { ok: false, error: "The stored voice note data is unreadable." };
    return buildVoiceAttachment({
      contentType: parsed.contentType,
      contentBase64: parsed.contentBase64,
      filename: note.filename,
    });
  }
  if (note.source === "storage" && note.path) {
    if (!resolveStorage) {
      return {
        ok: false,
        error:
          "The voice note is stored in the voice-notes bucket but no storage resolver is available in this run.",
      };
    }
    const attachment = await resolveStorage(note.path);
    if (!attachment) {
      return {
        ok: false,
        error: `The stored voice note (${note.path}) could not be downloaded.`,
      };
    }
    return buildVoiceAttachment({
      contentType: attachment.contentType,
      contentBase64: attachment.contentBase64,
      filename: attachment.filename || note.filename,
    });
  }
  return { ok: false, error: "The step's voice note has no audio source." };
}
