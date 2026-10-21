/**
 * Voice-note storage — the private Supabase Storage bucket
 * `voice-notes` (migration 015), server-side only.
 *
 * Object layout: `<workspace_id>/<note_id>/<filename>` — the first
 * path segment is the workspace, which is what the bucket's RLS
 * policies and every route in this feature check before touching an
 * object. All access here goes through the service-role client from
 * route handlers that have ALREADY authenticated the session and
 * resolved the workspace server-side; the bucket itself is private
 * (no public URL exists), and playback is a short-lived signed URL
 * minted per request after the workspace-prefix check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAttachment } from "@/lib/email/types";
import { bytesToBase64, MAX_VOICE_NOTE_BYTES } from "./attachments";

export const VOICE_NOTES_BUCKET = "voice-notes";

/** Signed playback URLs are short-lived by design. */
export const VOICE_PLAYBACK_URL_TTL_SEC = 120;

export function buildVoiceNotePath(
  workspaceId: string,
  noteId: string,
  filename: string
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${workspaceId}/${noteId}/${safeName}`;
}

/**
 * The workspace-scope check every voice route applies: a path is
 * only touchable when its first segment is the caller's workspace.
 */
export function isWorkspaceVoicePath(workspaceId: string, path: string): boolean {
  if (!workspaceId || !path) return false;
  const prefix = `${workspaceId}/`;
  if (!path.startsWith(prefix)) return false;
  // No traversal, no empty segments.
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("..") && !rest.startsWith("/");
}

export type UploadVoiceNoteResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function uploadVoiceNote(
  admin: SupabaseClient,
  input: {
    workspaceId: string;
    noteId: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }
): Promise<UploadVoiceNoteResult> {
  if (!input.contentType.startsWith("audio/")) {
    return { ok: false, error: `Only audio files can be stored as voice notes (got "${input.contentType}").` };
  }
  if (input.bytes.length === 0) {
    return { ok: false, error: "The voice note is empty." };
  }
  if (input.bytes.length > MAX_VOICE_NOTE_BYTES) {
    return {
      ok: false,
      error: `The voice note exceeds the ${MAX_VOICE_NOTE_BYTES / (1024 * 1024)} MB limit.`,
    };
  }
  const path = buildVoiceNotePath(input.workspaceId, input.noteId, input.filename);
  const { error } = await admin.storage
    .from(VOICE_NOTES_BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType, upsert: true });
  if (error) {
    return { ok: false, error: `Voice note upload failed: ${error.message}` };
  }
  return { ok: true, path };
}

/** Downloads a stored note as an email attachment (executor / reply sends). */
export async function downloadVoiceNoteAsAttachment(
  admin: SupabaseClient,
  path: string
): Promise<EmailAttachment | null> {
  const { data, error } = await admin.storage.from(VOICE_NOTES_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const filename = path.split("/").pop() || "voice-note.webm";
  return {
    filename,
    contentType: data.type || "audio/webm",
    contentBase64: bytesToBase64(bytes),
  };
}

/** Mints a short-lived signed playback URL for a stored note. */
export async function createVoicePlaybackUrl(
  admin: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(VOICE_NOTES_BUCKET)
    .createSignedUrl(path, VOICE_PLAYBACK_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
