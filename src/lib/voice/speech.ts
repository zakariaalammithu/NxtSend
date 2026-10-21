/**
 * Browser speech wrappers (P6 Stage C): Web Speech STT + TTS.
 *
 * STT (SpeechRecognition): Chrome/Edge expose it webkit-prefixed and
 * stream audio to the vendor's servers; Safari has a partial
 * implementation; Firefox has none. The wrapper therefore reports an
 * explicit UNSUPPORTED result instead of pretending — the composer
 * then offers the server Whisper path (or says dictation is
 * unavailable here).
 *
 * TTS (speechSynthesis): broadly available, but the VOICES are
 * OS-provided — a chosen language can only be spoken when the device
 * has a matching voice. `pickVoiceForLanguage` returns null in that
 * case and the UI says the device has no voice for the language
 * rather than silently speaking it in the wrong one.
 */

import type { VoiceHost } from "./capabilities";

// ── Speech recognition (STT) ───────────────────────────────────────────────

export interface RecognitionResultEvent {
  finalText: string;
  interimText: string;
}

export interface SpeechRecognizer {
  readonly supported: true;
  start(): void;
  stop(): void;
}

export type CreateRecognizerResult =
  | SpeechRecognizer
  | {
      supported: false;
      reason: string;
    };

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
          length: number;
        }>;
      }) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export function createSpeechRecognizer(
  host: VoiceHost,
  opts: {
    language: string;
    onResult: (e: RecognitionResultEvent) => void;
    onError: (message: string) => void;
    onEnd?: () => void;
  }
): CreateRecognizerResult {
  const Ctor = (host.SpeechRecognition ?? host.webkitSpeechRecognition) as
    | (new () => RecognitionLike)
    | undefined;
  if (typeof Ctor !== "function") {
    return {
      supported: false,
      reason:
        "This browser has no built-in speech recognition (Firefox, for example, ships none). Dictation can still work through the server transcription service when it is configured.",
    };
  }
  let recognition: RecognitionLike;
  try {
    recognition = new Ctor();
  } catch {
    return {
      supported: false,
      reason: "The browser's speech recognition could not be initialised.",
    };
  }
  recognition.lang = opts.language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    let finalText = "";
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) finalText += transcript;
      else interimText += transcript;
    }
    opts.onResult({ finalText, interimText });
  };
  recognition.onerror = (e) => {
    const code = e.error ?? "unknown";
    const friendly =
      code === "not-allowed"
        ? "Microphone permission was denied, so dictation stopped."
        : code === "no-speech"
          ? "No speech was detected. Try again and speak closer to the microphone."
          : code === "audio-capture"
            ? "No microphone is available for dictation."
            : `Speech recognition stopped (${code}).`;
    opts.onError(friendly);
  };
  recognition.onend = () => opts.onEnd?.();
  return {
    supported: true,
    start() {
      try {
        recognition.start();
      } catch {
        // start() throws when called twice — a live session is fine.
      }
    },
    stop() {
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    },
  };
}

// ── Speech synthesis (TTS) ─────────────────────────────────────────────────

export interface SpeechSynthesisLike {
  speak(utterance: unknown): void;
  cancel(): void;
  getVoices(): Array<{ lang: string; name: string; default?: boolean }>;
}

interface UtteranceLike {
  text: string;
  lang: string;
  voice: unknown;
  rate: number;
}

export interface TtsDeps {
  synthesis?: SpeechSynthesisLike | null;
  createUtterance?: (text: string) => UtteranceLike;
}

function defaultUtterance(text: string): UtteranceLike {
  const Ctor = (
    globalThis as unknown as {
      SpeechSynthesisUtterance?: new (t: string) => UtteranceLike;
    }
  ).SpeechSynthesisUtterance;
  if (!Ctor) throw new Error("SpeechSynthesisUtterance is unavailable");
  return new Ctor(text);
}

function browserSynthesis(): SpeechSynthesisLike | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  return window.speechSynthesis as unknown as SpeechSynthesisLike;
}

/**
 * Picks the best installed voice for a BCP-47 language: exact locale
 * match first, then any voice sharing the primary subtag (so en-GB
 * text can use an en-US voice rather than nothing). Returns null when
 * the device has NO voice for the language at all.
 */
export function pickVoiceForLanguage(
  voices: Array<{ lang: string; name: string }>,
  language: string
): { lang: string; name: string } | null {
  if (voices.length === 0) return null;
  const want = language.toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === want);
  if (exact) return exact;
  const primary = want.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase().split("-")[0] === primary) ??
    null
  );
}

export type SpeakResult =
  | { ok: true; voiceName: string; voiceLang: string }
  | { ok: false; reason: string };

/**
 * Speaks text aloud in the requested language. Honest failures:
 * synthesis unsupported, or no installed voice matches the language.
 */
export function speakText(
  text: string,
  language: string,
  deps: TtsDeps = {}
): SpeakResult {
  const synthesis =
    deps.synthesis !== undefined ? deps.synthesis : browserSynthesis();
  if (!synthesis) {
    return {
      ok: false,
      reason: "Text-to-speech is not supported in this browser.",
    };
  }
  const voices = synthesis.getVoices();
  const voice = pickVoiceForLanguage(voices, language);
  if (voices.length > 0 && !voice) {
    return {
      ok: false,
      reason: `Your device has no voice installed for this language, so it cannot be read aloud. The text itself is unaffected.`,
    };
  }
  const utterance = (deps.createUtterance ?? defaultUtterance)(text);
  utterance.lang = language;
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  synthesis.cancel();
  synthesis.speak(utterance);
  return {
    ok: true,
    voiceName: voice?.name ?? "default voice",
    voiceLang: voice?.lang ?? language,
  };
}

export function stopSpeaking(deps: TtsDeps = {}): void {
  const synthesis =
    deps.synthesis !== undefined ? deps.synthesis : browserSynthesis();
  synthesis?.cancel();
}

/** Installed voices (may be empty until the browser loads them). */
export function listInstalledVoices(deps: TtsDeps = {}): Array<{
  lang: string;
  name: string;
}> {
  const synthesis =
    deps.synthesis !== undefined ? deps.synthesis : browserSynthesis();
  if (!synthesis) return [];
  try {
    return synthesis.getVoices();
  } catch {
    return [];
  }
}
