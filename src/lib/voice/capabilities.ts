/**
 * Voice capability detection (P6 Stage C).
 *
 * Every voice feature is progressive: the UI renders only what the
 * CURRENT browser actually supports, and says so plainly when a
 * feature is unavailable. Detection reads a "host" object (window /
 * navigator shaped) so the matrix logic is unit-testable without a
 * browser; in the app it is fed the real globals.
 *
 * The matrix (matches the P6 audit):
 *  - recording: MediaRecorder + getUserMedia — broad support.
 *  - browser STT: SpeechRecognition (or the webkit- prefixed variant)
 *    — Chrome/Edge/Safari; Firefox has none.
 *  - TTS: speechSynthesis — broad; the installed VOICES decide which
 *    languages can actually be spoken (see ./speech.ts).
 *  - server transcription (Whisper) + AI translation are SERVER
 *    capabilities — the client learns them from the API routes'
 *    responses, never assumes them; they are inputs to the summary,
 *    not detected here.
 */

export interface VoiceHost {
  MediaRecorder?: unknown;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  speechSynthesis?: unknown;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
}

export interface VoiceCapabilities {
  /** MediaRecorder exists AND getUserMedia exists → can record. */
  recording: boolean;
  /** A SpeechRecognition constructor exists → browser dictation. */
  browserSpeechRecognition: boolean;
  /** speechSynthesis exists → text-to-speech (voices vary by device). */
  speechSynthesis: boolean;
}

export function detectVoiceCapabilities(host: VoiceHost): VoiceCapabilities {
  const recording =
    typeof host.MediaRecorder === "function" &&
    typeof host.navigator?.mediaDevices?.getUserMedia === "function";
  const browserSpeechRecognition =
    typeof host.SpeechRecognition === "function" ||
    typeof host.webkitSpeechRecognition === "function";
  const speechSynthesis = !!host.speechSynthesis &&
    typeof (host.speechSynthesis as { speak?: unknown }).speak === "function";
  return { recording, browserSpeechRecognition, speechSynthesis };
}

/** The host built from the real browser globals ({} outside a browser). */
export function browserVoiceHost(): VoiceHost {
  if (typeof window === "undefined") return {};
  const w = window as unknown as Record<string, unknown>;
  return {
    MediaRecorder: w.MediaRecorder,
    SpeechRecognition: w.SpeechRecognition,
    webkitSpeechRecognition: w.webkitSpeechRecognition,
    speechSynthesis: w.speechSynthesis,
    navigator: typeof navigator !== "undefined" ? navigator : undefined,
  };
}

export type DictationEngine = "browser" | "whisper" | "none";

/**
 * Which dictation path the composer can offer, in preference order:
 * the browser's own recognizer when present (no upload, instant),
 * else the server Whisper route when the server reports it configured,
 * else none — the composer then shows the honest unavailable note
 * instead of a dead mic button.
 */
export function resolveDictationEngine(
  caps: VoiceCapabilities,
  serverTranscription: boolean
): DictationEngine {
  if (caps.browserSpeechRecognition) return "browser";
  if (serverTranscription) return "whisper";
  return "none";
}

/** One-line honest summary of what voice can do in this browser. */
export function describeCapabilities(caps: VoiceCapabilities): string {
  const parts: string[] = [];
  parts.push(
    caps.recording
      ? "Voice recording is supported in this browser."
      : "Voice recording is NOT supported in this browser (no MediaRecorder / microphone API)."
  );
  parts.push(
    caps.browserSpeechRecognition
      ? "Browser dictation (speech-to-text) is available."
      : "This browser has no built-in speech recognition — dictation needs the server transcription service."
  );
  parts.push(
    caps.speechSynthesis
      ? "Text-to-speech playback is available (voices depend on your device)."
      : "Text-to-speech is NOT supported in this browser."
  );
  return parts.join(" ");
}
