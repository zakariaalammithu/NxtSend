"use client";

/**
 * VoiceNotePlayer — plays a stored voice note inside a message
 * thread (P6 Stage C).
 *
 * Source resolution is honest about where the audio lives:
 *  - `data:` URL (Demo Mode) → played directly; the audio never left
 *    the browser that recorded it.
 *  - storage path (live mode) → a short-lived signed URL is fetched
 *    from /api/voice/playback (the route re-checks workspace scope
 *    server-side); until it arrives — or if it fails — the chip says
 *    so instead of rendering a dead player.
 */

import * as React from "react";
import { AlertTriangle, Loader2, Mic } from "lucide-react";
import { isDataUrl } from "@/lib/voice/attachments";
import { findVoiceLanguage } from "@/lib/voice/languages";
import { formatDuration } from "@/lib/voice/recorder";

export interface VoiceNotePlayerProps {
  path: string;
  mode: "demo" | "supabase";
  durationSec?: number | null;
  language?: string | null;
  transcript?: string | null;
  /** Outbound bubbles are purple — soften the chip chrome on them. */
  onAccent?: boolean;
}

export function VoiceNotePlayer({
  path,
  mode,
  durationSec,
  language,
  transcript,
  onAccent = false,
}: VoiceNotePlayerProps) {
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const direct = isDataUrl(path);

  React.useEffect(() => {
    if (direct) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/voice/playback?path=${encodeURIComponent(path)}`
        );
        const data = (await res.json()) as { url?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.url) {
          setError(data.error ?? "The voice note could not be loaded.");
        } else {
          setSignedUrl(data.url);
        }
      } catch {
        if (!cancelled) setError("The voice note could not be loaded (network error).");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, direct]);

  const src = direct ? path : signedUrl;
  const languageLabel = language
    ? (findVoiceLanguage(language)?.label ?? language)
    : null;

  return (
    <div
      className={`mt-2 rounded-xl border px-3 py-2.5 ${
        onAccent
          ? "border-white/25 bg-white/10"
          : "border-black-600 bg-black-800/80"
      }`}
      data-testid="voice-note-player"
    >
      <div className="flex items-center gap-2">
        <Mic className={`h-3.5 w-3.5 shrink-0 ${onAccent ? "text-white" : "text-purple-300"}`} />
        <span className={`text-11 font-semibold ${onAccent ? "text-white" : "text-black-100"}`}>
          Voice note
          {typeof durationSec === "number" ? ` · ${formatDuration(durationSec)}` : ""}
          {languageLabel ? ` · ${languageLabel}` : ""}
        </span>
        {mode === "demo" && (
          <span className="demo-badge text-9 py-0 px-1">Demo</span>
        )}
      </div>
      {src ? (
        <audio
          controls
          src={src}
          preload="metadata"
          className="mt-2 h-9 w-full max-w-80"
          data-testid="voice-note-audio"
        />
      ) : error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-11 text-rose-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1.5 text-11 text-black-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading the recording…
        </p>
      )}
      {transcript && (
        <p className={`mt-2 text-11 leading-relaxed ${onAccent ? "text-white/85" : "text-black-300"}`}>
          <span className="font-semibold">Transcript:</span> {transcript}
        </p>
      )}
    </div>
  );
}

export default VoiceNotePlayer;
