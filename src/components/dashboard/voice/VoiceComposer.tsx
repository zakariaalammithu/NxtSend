"use client";

/**
 * VoiceComposer — the shared voice controls for the inbox reply
 * composer and the sequence step editor (P6 Stage C).
 *
 * What it offers, each gated on the REAL capability matrix of the
 * current browser + server (never assumed):
 *  - Dictation (speech-to-text) into the text: the browser's own
 *    SpeechRecognition when present, else server transcription via
 *    OpenAI Whisper when configured, else an honest "unavailable
 *    here" note. Transcripts are labelled with the engine that
 *    produced them.
 *  - Record a voice note: record → timer → preview play → delete or
 *    attach. Demo Mode keeps the audio in the browser (data URL);
 *    live mode uploads it to the private voice-notes bucket.
 *  - Text-to-speech read-aloud via speechSynthesis, in the selected
 *    language when the device has a matching voice.
 *  - Translation of the current text via /api/voice/translate (the
 *    AI provider stack; demo answers with the labelled simulated
 *    state and changes nothing).
 *  - A language selector shared by all of the above, persisted in
 *    the user-settings substrate.
 *
 * Delivery honesty: a voice note is delivered as an EMAIL
 * attachment. There is no LinkedIn voice-note delivery — surfaces
 * pass `allowAttach={false}` + a delivery note for LinkedIn steps.
 */

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Languages,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  browserVoiceHost,
  detectVoiceCapabilities,
  resolveDictationEngine,
  type VoiceCapabilities,
} from "@/lib/voice/capabilities";
import {
  DEFAULT_VOICE_LANGUAGE,
  VOICE_LANGUAGES,
  findVoiceLanguage,
  normalizeVoiceLanguage,
} from "@/lib/voice/languages";
import {
  MAX_RECORDING_SECONDS,
  VoiceRecorder,
  formatDuration,
  type MediaRecorderLike,
  type MediaStreamLike,
  type RecordedTake,
} from "@/lib/voice/recorder";
import {
  createSpeechRecognizer,
  speakText,
  stopSpeaking,
  type SpeechRecognizer,
} from "@/lib/voice/speech";
import {
  blobToBase64,
  voiceNoteFilename,
} from "@/lib/voice/attachments";
import { getUserSettingsRepository } from "@/lib/data/user-settings";

// ── Language selector + persistence ────────────────────────────────────────

export function VoiceLanguageSelect({
  value,
  onChange,
  disabled,
  testId = "voice-language-select",
  label = "Voice language",
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <Languages className="h-3.5 w-3.5 text-black-400" aria-hidden="true" />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-black-600 bg-black-800 px-2 py-1.5 text-12 text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
        data-testid={testId}
        aria-label={label}
      >
        {VOICE_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel} — {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The persisted voice language: read from the user-settings
 * substrate on mount; every change is written back through the same
 * repository the Settings page uses (which preserves it across
 * preference saves — see src/lib/data/user-settings.ts).
 */
export function useVoiceLanguage(): [
  string,
  (code: string) => void,
] {
  const [language, setLanguage] = React.useState(DEFAULT_VOICE_LANGUAGE);
  React.useEffect(() => {
    let cancelled = false;
    getUserSettingsRepository()
      .getSettings()
      .then((s) => {
        if (!cancelled && s.preferences.voice_language) {
          setLanguage(normalizeVoiceLanguage(s.preferences.voice_language));
        }
      })
      .catch(() => {
        // Defaults apply — voice still works, just in en-US.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = React.useCallback((code: string) => {
    setLanguage(code);
    (async () => {
      try {
        const repo = getUserSettingsRepository();
        const current = await repo.getSettings();
        await repo.updatePreferences({
          ...current.preferences,
          voice_language: code,
        });
      } catch {
        // Persistence is best-effort; the in-session choice stands.
      }
    })();
  }, []);
  return [language, update];
}

// ── Attached note shape (what the parent surface sends/stores) ─────────────

export interface ComposerVoiceNote {
  filename: string;
  contentType: string;
  durationSec: number;
  language: string;
  transcript: string | null;
  /** Demo Mode: the audio inline as base64 (stored as a data: URL). */
  dataBase64?: string;
  /** Live mode: the private-bucket path from /api/voice/upload. */
  path?: string;
  /** Local preview URL for a just-recorded note. */
  objectUrl?: string;
}

// ── Server transcription probe (cached per page load) ──────────────────────

let whisperProbe: Promise<boolean> | null = null;
function probeWhisper(): Promise<boolean> {
  if (!whisperProbe) {
    whisperProbe = (async () => {
      try {
        const res = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: new FormData(),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
        };
        // Configured Whisper rejects the empty probe as an invalid
        // request (it got past the config gate); not_configured /
        // demo / unauthenticated mean dictation-by-server is off.
        return data.status === "invalid_request";
      } catch {
        return false;
      }
    })();
  }
  return whisperProbe;
}

// ── The composer ────────────────────────────────────────────────────────────

export interface VoiceComposerProps {
  text: string;
  onTextChange: (next: string) => void;
  /** What TTS reads aloud (defaults to `text`). */
  ttsText?: string;
  language: string;
  onLanguageChange: (code: string) => void;
  mode: "demo" | "supabase";
  /** Record/attach controls (false where notes can't be delivered). */
  allowAttach?: boolean;
  /** Honest delivery note rendered under the controls. */
  deliveryNote?: string;
  note?: ComposerVoiceNote | null;
  onNoteChange?: (note: ComposerVoiceNote | null) => void;
}

type RecPurpose = "note" | "dictation";

export function VoiceComposer({
  text,
  onTextChange,
  ttsText,
  language,
  onLanguageChange,
  mode,
  allowAttach = true,
  deliveryNote,
  note,
  onNoteChange,
}: VoiceComposerProps) {
  const [caps, setCaps] = React.useState<VoiceCapabilities | null>(null);
  const [whisper, setWhisper] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Dictation (browser engine)
  const [dictating, setDictating] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const recognizerRef = React.useRef<SpeechRecognizer | null>(null);
  const textRef = React.useRef(text);
  textRef.current = text;
  const dictationBaseRef = React.useRef("");
  const dictationFinalRef = React.useRef("");

  // Recording (note + whisper dictation share one recorder)
  const recorderRef = React.useRef<VoiceRecorder | null>(null);
  const [recState, setRecState] = React.useState<string>("idle");
  const [recPurpose, setRecPurpose] = React.useState<RecPurpose>("note");
  const [elapsed, setElapsed] = React.useState(0);
  const [take, setTake] = React.useState<RecordedTake | null>(null);
  const [takeUrl, setTakeUrl] = React.useState<string | null>(null);
  const [transcribing, setTranscribing] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);

  // TTS + translation
  const [speaking, setSpeaking] = React.useState(false);
  const [translateTarget, setTranslateTarget] = React.useState(language);
  const [translating, setTranslating] = React.useState(false);

  React.useEffect(() => {
    setCaps(detectVoiceCapabilities(browserVoiceHost()));
    if (mode !== "demo") {
      probeWhisper().then(setWhisper).catch(() => setWhisper(false));
    }
  }, [mode]);

  // Elapsed ticker + max-duration enforcement while recording.
  React.useEffect(() => {
    if (recState !== "recording" && recState !== "paused") return;
    const t = setInterval(() => {
      const rec = recorderRef.current;
      if (!rec) return;
      const s = rec.elapsedSec();
      setElapsed(s);
      if (s >= MAX_RECORDING_SECONDS && recState === "recording") {
        void stopRecording();
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState]);

  // Unmount cleanup: release mic, URLs and speech.
  React.useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recorderRef.current?.discard();
      stopSpeaking();
    };
  }, []);
  React.useEffect(() => {
    return () => {
      if (takeUrl) URL.revokeObjectURL(takeUrl);
    };
  }, [takeUrl]);

  const engine = caps ? resolveDictationEngine(caps, whisper) : "none";
  const languageLabel =
    findVoiceLanguage(language)?.label ?? language;

  // ── Dictation: browser engine ──────────────────────────────────────────
  const startBrowserDictation = () => {
    setError(null);
    setNotice(null);
    const created = createSpeechRecognizer(browserVoiceHost(), {
      language,
      onResult: (e) => {
        if (e.finalText) {
          dictationFinalRef.current += e.finalText;
          const base = dictationBaseRef.current;
          const joined =
            (base ? base.replace(/\s+$/, "") + " " : "") +
            dictationFinalRef.current.trim();
          onTextChange(joined);
        }
        setInterim(e.interimText);
      },
      onError: (message) => {
        setError(message);
        setDictating(false);
      },
      onEnd: () => {
        setDictating(false);
        setInterim("");
      },
    });
    if (!created.supported) {
      setError(created.reason);
      return;
    }
    dictationBaseRef.current = textRef.current;
    dictationFinalRef.current = "";
    recognizerRef.current = created;
    created.start();
    setDictating(true);
    setNotice(
      `Dictating with your browser's speech recognition (${languageLabel}). The text is inserted as you speak — review it before sending.`
    );
  };

  const stopBrowserDictation = () => {
    recognizerRef.current?.stop();
    setDictating(false);
    setInterim("");
  };

  // ── Recording (shared by note capture + Whisper dictation) ────────────
  const makeRecorder = () =>
    new VoiceRecorder({
      getUserMedia: (constraints) =>
        navigator.mediaDevices.getUserMedia(
          constraints
        ) as unknown as Promise<MediaStreamLike>,
      createRecorder: (stream, options) =>
        new MediaRecorder(
          stream as unknown as MediaStream,
          options
        ) as unknown as MediaRecorderLike,
      isTypeSupported: (t) =>
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(t),
    });

  const startRecording = async (purpose: RecPurpose) => {
    setError(null);
    setNotice(null);
    if (purpose === "note") discardTake();
    const rec = makeRecorder();
    recorderRef.current = rec;
    setRecPurpose(purpose);
    const ok = await rec.start();
    setRecState(rec.state);
    if (!ok) {
      setError(rec.error?.message ?? "Recording could not start.");
      return;
    }
    setElapsed(0);
    if (purpose === "dictation") {
      setNotice(
        "Recording for server transcription — press Stop when you finish speaking; the clip is sent to OpenAI Whisper."
      );
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    rec.stop();
    // MediaRecorder finalizes the take asynchronously (onstop).
    const finished = await rec.whenStopped();
    setRecState(rec.state);
    if (!finished) {
      setError(rec.error?.message ?? "The recording produced no audio.");
      return;
    }
    if (recPurpose === "dictation") {
      await transcribeClip(finished.blob, "dictation");
      recorderRef.current = null;
      setRecState("idle");
      return;
    }
    const url = URL.createObjectURL(finished.blob);
    setTake(finished);
    setTakeUrl(url);
  };

  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (recState === "recording") rec.pause();
    else if (recState === "paused") rec.resume();
    setRecState(rec.state);
  };

  const discardTake = () => {
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    setTake(null);
    setTakeUrl(null);
    recorderRef.current?.discard();
    recorderRef.current = null;
    setRecState("idle");
  };

  // ── Transcription (Whisper) ────────────────────────────────────────────
  const transcribeClip = async (
    blob: Blob,
    target: "dictation" | "note"
  ): Promise<string | null> => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, voiceNoteFilename(blob.type || "audio/webm"));
      fd.append("language", language);
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        status?: string;
        transcript?: string | null;
        message?: string;
      };
      if (!res.ok || !data.transcript) {
        setError(
          data.message ??
            "Transcription is unavailable — the note itself is unaffected."
        );
        return null;
      }
      if (target === "dictation") {
        const base = textRef.current;
        onTextChange(
          (base ? base.replace(/\s+$/, "") + " " : "") + data.transcript
        );
        setNotice(
          "Transcribed by OpenAI Whisper (server). Review the text before sending."
        );
      }
      return data.transcript;
    } catch {
      setError("Transcription request failed (network error).");
      return null;
    } finally {
      setTranscribing(false);
    }
  };

  // ── Attach the take as the surface's voice note ────────────────────────
  const attachTake = async () => {
    if (!take) return;
    setAttaching(true);
    setError(null);
    try {
      const filename = voiceNoteFilename(take.mimeType);
      // Best-effort transcript for the note when Whisper is available.
      let transcript: string | null = null;
      if (whisper) {
        transcript = await transcribeClip(take.blob, "note");
        if (transcript) {
          setNotice(
            "Transcript by OpenAI Whisper attached to the note. Review it — it becomes the message text if you send the note without typing."
          );
        }
      }
      if (mode === "demo") {
        const dataBase64 = await blobToBase64(take.blob);
        onNoteChange?.({
          filename,
          contentType: take.mimeType,
          durationSec: take.durationSec,
          language,
          transcript,
          dataBase64,
          objectUrl: takeUrl ?? undefined,
        });
      } else {
        const fd = new FormData();
        fd.append("audio", take.blob, filename);
        const res = await fetch("/api/voice/upload", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json()) as { path?: string; error?: string };
        if (!res.ok || !data.path) {
          throw new Error(data.error ?? "The voice note upload failed.");
        }
        onNoteChange?.({
          filename,
          contentType: take.mimeType,
          durationSec: take.durationSec,
          language,
          transcript,
          path: data.path,
          objectUrl: takeUrl ?? undefined,
        });
      }
      // The take becomes the attached note (preview lives in the chip).
      setTake(null);
      setRecState("idle");
      recorderRef.current = null;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The voice note could not be attached."
      );
    } finally {
      setAttaching(false);
    }
  };

  // ── TTS ────────────────────────────────────────────────────────────────
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const spoken = (ttsText ?? text).trim();
    if (!spoken) return;
    const result = speakText(spoken, language);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setSpeaking(true);
    setNotice(
      `Reading aloud with the "${result.voiceName}" voice (${result.voiceLang}). Voices are provided by your device.`
    );
    // speechSynthesis has no reliable global "ended" hook here; the
    // button flips back after a generous estimate or on next click.
    window.setTimeout(() => setSpeaking(false), Math.min(30000, 1200 + spoken.length * 90));
  };

  // ── Translation ────────────────────────────────────────────────────────
  const translateCurrentText = async () => {
    const source = text.trim();
    if (!source) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: source,
          targetLanguage: translateTarget,
          sourceLanguage: language,
        }),
      });
      const data = (await res.json()) as {
        status?: string;
        translatedText?: string | null;
        message?: string;
      };
      if (data.status === "ok" && data.translatedText) {
        onTextChange(data.translatedText);
        onLanguageChange(translateTarget);
        setNotice(
          `${data.message ?? "Translated."} The composer language switched to ${findVoiceLanguage(translateTarget)?.label ?? translateTarget}.`
        );
      } else {
        // simulated / not_configured / error — text stays untouched.
        setNotice(data.message ?? "Translation is unavailable right now.");
      }
    } catch {
      setError("Translation request failed (network error). Your text was not changed.");
    } finally {
      setTranslating(false);
    }
  };

  const busy =
    dictating || recState === "recording" || recState === "paused" || transcribing;
  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-11 font-medium text-black-100 hover:text-white hover:border-purple-500/50 transition-colors disabled:opacity-40 disabled:pointer-events-none";
  const btnActive =
    "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-600/20 px-2.5 py-1.5 text-11 font-semibold text-rose-200 transition-colors";

  return (
    <div
      className="rounded-xl border border-black-700 bg-black-900/60 p-3 space-y-2.5"
      data-testid="voice-composer"
    >
      {/* Header: title + language */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-12 font-semibold text-white">
          <Mic className="h-3.5 w-3.5 text-purple-300" />
          Voice
        </span>
        <VoiceLanguageSelect
          value={language}
          onChange={onLanguageChange}
          disabled={busy}
        />
        {caps && (
          <span className="text-10 text-black-500">
            {engine === "browser"
              ? "Dictation: this browser's speech recognition"
              : engine === "whisper"
                ? "Dictation: OpenAI Whisper (server)"
                : "Dictation unavailable in this browser"}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        {engine === "browser" &&
          (dictating ? (
            <button type="button" onClick={stopBrowserDictation} className={btnActive} data-testid="voice-dictate-btn">
              <Square className="h-3 w-3" /> Stop dictation
            </button>
          ) : (
            <button
              type="button"
              onClick={startBrowserDictation}
              disabled={busy}
              className={btn}
              data-testid="voice-dictate-btn"
            >
              <Mic className="h-3 w-3" /> Dictate
            </button>
          ))}
        {engine === "whisper" &&
          (recPurpose === "dictation" && (recState === "recording" || recState === "paused") ? (
            <button type="button" onClick={() => void stopRecording()} className={btnActive} data-testid="voice-dictate-btn">
              <Square className="h-3 w-3" /> Stop &amp; transcribe
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording("dictation")}
              disabled={busy}
              className={btn}
              data-testid="voice-dictate-btn"
            >
              <Mic className="h-3 w-3" /> Dictate (Whisper)
            </button>
          ))}
        {engine === "none" && (
          <span className="text-11 text-black-400" data-testid="voice-dictation-unavailable">
            Dictation is unavailable here: this browser has no speech
            recognition and server transcription (Whisper) is not
            configured.
          </span>
        )}

        {allowAttach && caps?.recording && !take && recPurpose === "note" &&
          (recState === "recording" || recState === "paused" ? (
            <>
              <button type="button" onClick={togglePause} className={btn} data-testid="voice-pause-btn">
                {recState === "recording" ? (
                  <><Pause className="h-3 w-3" /> Pause</>
                ) : (
                  <><Play className="h-3 w-3" /> Resume</>
                )}
              </button>
              <button type="button" onClick={() => void stopRecording()} className={btnActive} data-testid="voice-record-btn">
                <Square className="h-3 w-3" /> Stop · {formatDuration(elapsed)}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording("note")}
              disabled={busy || !!note}
              className={btn}
              data-testid="voice-record-btn"
            >
              <Mic className="h-3 w-3" /> Record voice note
            </button>
          ))}
        {allowAttach && caps && !caps.recording && (
          <span className="text-11 text-black-400">
            Voice recording is not supported in this browser.
          </span>
        )}

        <button
          type="button"
          onClick={toggleSpeak}
          disabled={!caps?.speechSynthesis || !(ttsText ?? text).trim()}
          className={speaking ? btnActive : btn}
          data-testid="voice-tts-btn"
        >
          {speaking ? (
            <><VolumeX className="h-3 w-3" /> Stop reading</>
          ) : (
            <><Volume2 className="h-3 w-3" /> Listen</>
          )}
        </button>

        <span className="inline-flex items-center gap-1.5">
          <VoiceLanguageSelect
            value={translateTarget}
            onChange={setTranslateTarget}
            disabled={translating || !text.trim()}
            testId="voice-translate-target"
            label="Translate to"
          />
          <button
            type="button"
            onClick={() => void translateCurrentText()}
            disabled={translating || !text.trim()}
            className={btn}
            data-testid="voice-translate-btn"
          >
            {translating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )}
            Translate text
          </button>
        </span>
      </div>

      {/* Dictation interim */}
      {dictating && (
        <p className="text-11 text-black-300" data-testid="voice-interim">
          Listening… {interim && <span className="text-black-500">{interim}</span>}
        </p>
      )}
      {transcribing && (
        <p className="flex items-center gap-1.5 text-11 text-black-300">
          <Loader2 className="h-3 w-3 animate-spin" /> Transcribing with OpenAI Whisper…
        </p>
      )}

      {/* Take preview: preview play → delete or attach */}
      {take && takeUrl && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-black-600 bg-black-800/70 px-2.5 py-2"
          data-testid="voice-take-preview"
        >
          <audio
            controls
            src={takeUrl}
            preload="metadata"
            className="h-8 w-52"
            data-testid="voice-take-audio"
          />
          <span className="text-11 text-black-300" data-testid="voice-take-duration">
            {formatDuration(take.durationSec)} · {languageLabel}
          </span>
          <button
            type="button"
            onClick={() => void attachTake()}
            disabled={attaching}
            className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1.5 text-11 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
            data-testid="voice-attach-btn"
          >
            {attaching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Attach note
          </button>
          <button
            type="button"
            onClick={discardTake}
            disabled={attaching}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-11 font-medium text-rose-200 disabled:opacity-40"
            data-testid="voice-delete-take"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      )}

      {/* Attached note chip */}
      {note && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-600/10 px-2.5 py-2"
          data-testid="voice-note-chip"
        >
          <Mic className="h-3.5 w-3.5 text-purple-300" />
          <span className="text-11 font-medium text-purple-100">
            Voice note attached · <span data-testid="voice-note-duration">{formatDuration(note.durationSec)}</span>
            {" · "}{findVoiceLanguage(note.language)?.label ?? note.language}
          </span>
          {note.objectUrl && (
            <audio controls src={note.objectUrl} preload="metadata" className="h-8 w-48" />
          )}
          <button
            type="button"
            onClick={() => onNoteChange?.(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-black-600 bg-black-800 px-2 py-1 text-11 text-black-200 hover:text-white"
            data-testid="voice-remove-note"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
          {note.transcript && (
            <p className="w-full text-11 text-black-300">
              <span className="font-semibold text-black-100">Transcript:</span>{" "}
              {note.transcript}
            </p>
          )}
        </div>
      )}

      {notice && (
        <p className="text-11 leading-relaxed text-black-400" data-testid="voice-notice">
          {notice}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-11 leading-relaxed text-rose-300" data-testid="voice-error">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
      {deliveryNote && (
        <p className="text-11 leading-relaxed text-black-500">{deliveryNote}</p>
      )}
    </div>
  );
}

export default VoiceComposer;
