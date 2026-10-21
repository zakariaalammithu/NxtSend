/**
 * Voice core tests (P6 Stage C): language catalogue integrity,
 * capability matrix, recorder state machine (mocked MediaRecorder),
 * STT/TTS wrappers (mocked recognition/synthesis), attachment
 * construction, step-note parsing/resolution and storage paths.
 */

import { describe, it, expect, vi } from "vitest";
import {
  VOICE_LANGUAGES,
  DEFAULT_VOICE_LANGUAGE,
  findVoiceLanguage,
  normalizeVoiceLanguage,
  voiceLanguagePrimarySubtag,
} from "../languages";
import {
  detectVoiceCapabilities,
  resolveDictationEngine,
  type VoiceHost,
} from "../capabilities";
import {
  VoiceRecorder,
  formatDuration,
  MAX_RECORDING_SECONDS,
  type MediaRecorderLike,
  type MediaStreamLike,
} from "../recorder";
import {
  createSpeechRecognizer,
  pickVoiceForLanguage,
  speakText,
} from "../speech";
import {
  audioDataUrl,
  buildVoiceAttachment,
  bytesToBase64,
  parseDataUrl,
  parseStepVoiceNote,
  resolveStepVoiceAttachment,
  voiceFileExtension,
} from "../attachments";
import {
  buildVoiceNotePath,
  isWorkspaceVoicePath,
  uploadVoiceNote,
  VOICE_NOTES_BUCKET,
} from "../storage";

// ── Catalogue ──────────────────────────────────────────────────────────────

describe("voice language catalogue", () => {
  it("has unique, well-formed BCP-47 codes with labels + countries", () => {
    const seen = new Set<string>();
    for (const lang of VOICE_LANGUAGES) {
      expect(lang.code).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
      expect(lang.label.length).toBeGreaterThan(3);
      expect(lang.nativeLabel.length).toBeGreaterThan(0);
      expect(lang.country.length).toBeGreaterThan(1);
      expect(seen.has(lang.code.toLowerCase())).toBe(false);
      seen.add(lang.code.toLowerCase());
    }
    expect(VOICE_LANGUAGES.length).toBeGreaterThanOrEqual(50);
  });

  it("covers the owner's required languages", () => {
    for (const code of [
      "en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR",
      "hi-IN", "bn-BD", "ar-SA", "ja-JP", "ko-KR", "zh-CN",
    ]) {
      expect(findVoiceLanguage(code), code).not.toBeNull();
    }
  });

  it("lookups are case-insensitive; unknown codes fall back to the default", () => {
    expect(findVoiceLanguage("EN-us")?.code).toBe("en-US");
    expect(findVoiceLanguage("xx-YY")).toBeNull();
    expect(normalizeVoiceLanguage("xx-YY")).toBe(DEFAULT_VOICE_LANGUAGE);
    expect(normalizeVoiceLanguage(undefined)).toBe(DEFAULT_VOICE_LANGUAGE);
    expect(normalizeVoiceLanguage("bn-bd")).toBe("bn-BD");
  });

  it("derives the Whisper primary subtag", () => {
    expect(voiceLanguagePrimarySubtag("en-US")).toBe("en");
    expect(voiceLanguagePrimarySubtag("bn-BD")).toBe("bn");
    expect(voiceLanguagePrimarySubtag("zh-TW")).toBe("zh");
  });
});

// ── Capabilities ───────────────────────────────────────────────────────────

describe("capability detection", () => {
  const full: VoiceHost = {
    MediaRecorder: function () {},
    SpeechRecognition: function () {},
    speechSynthesis: { speak: () => {} },
    navigator: { mediaDevices: { getUserMedia: () => {} } },
  };

  it("detects a fully capable browser", () => {
    expect(detectVoiceCapabilities(full)).toEqual({
      recording: true,
      browserSpeechRecognition: true,
      speechSynthesis: true,
    });
  });

  it("detects the webkit-prefixed recognition constructor", () => {
    const caps = detectVoiceCapabilities({
      ...full,
      SpeechRecognition: undefined,
      webkitSpeechRecognition: function () {},
    });
    expect(caps.browserSpeechRecognition).toBe(true);
  });

  it("Firefox-like host: no recognition, recording still possible", () => {
    const caps = detectVoiceCapabilities({
      MediaRecorder: function () {},
      speechSynthesis: { speak: () => {} },
      navigator: { mediaDevices: { getUserMedia: () => {} } },
    });
    expect(caps).toEqual({
      recording: true,
      browserSpeechRecognition: false,
      speechSynthesis: true,
    });
  });

  it("no getUserMedia → no recording even with MediaRecorder", () => {
    const caps = detectVoiceCapabilities({
      MediaRecorder: function () {},
      navigator: { mediaDevices: {} },
    });
    expect(caps.recording).toBe(false);
  });

  it("empty host → everything unsupported (SSR-safe)", () => {
    expect(detectVoiceCapabilities({})).toEqual({
      recording: false,
      browserSpeechRecognition: false,
      speechSynthesis: false,
    });
  });

  it("dictation engine preference: browser > whisper > none", () => {
    const withRec = { recording: true, browserSpeechRecognition: true, speechSynthesis: true };
    const withoutRec = { recording: true, browserSpeechRecognition: false, speechSynthesis: true };
    expect(resolveDictationEngine(withRec, true)).toBe("browser");
    expect(resolveDictationEngine(withRec, false)).toBe("browser");
    expect(resolveDictationEngine(withoutRec, true)).toBe("whisper");
    expect(resolveDictationEngine(withoutRec, false)).toBe("none");
  });
});

// ── Recorder state machine ─────────────────────────────────────────────────

class FakeRecorder implements MediaRecorderLike {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fake-audio"], { type: "audio/webm" }) });
    // MediaRecorder fires onstop asynchronously.
    queueMicrotask(() => this.onstop?.());
  }
}

function fakeStream(): MediaStreamLike & { stopped: boolean } {
  const s = {
    stopped: false,
    getTracks: () => [
      {
        stop: () => {
          s.stopped = true;
        },
      },
    ],
  };
  return s;
}

function makeRecorder(nowRef: { t: number }) {
  return new VoiceRecorder({
    getUserMedia: async () => fakeStream(),
    createRecorder: () => new FakeRecorder(),
    isTypeSupported: () => true,
    now: () => nowRef.t,
  });
}

describe("VoiceRecorder", () => {
  it("records → pauses → resumes → stops into a take with honest duration", async () => {
    const clock = { t: 1_000 };
    const rec = makeRecorder(clock);
    expect(await rec.start()).toBe(true);
    expect(rec.state).toBe("recording");
    clock.t += 10_000;
    rec.pause();
    expect(rec.state).toBe("paused");
    clock.t += 5_000; // paused time must not count
    rec.resume();
    clock.t += 2_000;
    rec.stop();
    const take = await rec.whenStopped();
    expect(rec.state).toBe("stopped");
    expect(take).not.toBeNull();
    expect(take!.durationSec).toBe(12);
    expect(take!.mimeType).toBe("audio/webm");
    expect(take!.blob.size).toBeGreaterThan(0);
  });

  it("reports permission denial as a typed error, never a take", async () => {
    const rec = new VoiceRecorder({
      getUserMedia: async () => {
        const err = new Error("denied");
        err.name = "NotAllowedError";
        throw err;
      },
      createRecorder: () => new FakeRecorder(),
    });
    expect(await rec.start()).toBe(false);
    expect(rec.state).toBe("error");
    expect(rec.error?.kind).toBe("permission_denied");
    expect(rec.take).toBeNull();
  });

  it("reports a missing microphone distinctly", async () => {
    const rec = new VoiceRecorder({
      getUserMedia: async () => {
        const err = new Error("none");
        err.name = "NotFoundError";
        throw err;
      },
      createRecorder: () => new FakeRecorder(),
    });
    expect(await rec.start()).toBe(false);
    expect(rec.error?.kind).toBe("no_device");
  });

  it("unsupported host (no deps) → unsupported error", async () => {
    const rec = new VoiceRecorder();
    expect(await rec.start()).toBe(false);
    expect(rec.error?.kind).toBe("unsupported");
  });

  it("discard returns to idle with no take and settles waiters", async () => {
    const clock = { t: 0 };
    const rec = makeRecorder(clock);
    await rec.start();
    const waiter = rec.whenStopped();
    rec.discard();
    expect(rec.state).toBe("idle");
    expect(rec.take).toBeNull();
    expect(await waiter).toBeNull();
  });

  it("duration cap constant is 120s and formatDuration renders m:ss", () => {
    expect(MAX_RECORDING_SECONDS).toBe(120);
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42)).toBe("0:42");
    expect(formatDuration(75)).toBe("1:15");
  });
});

// ── STT / TTS wrappers ─────────────────────────────────────────────────────

describe("speech wrappers", () => {
  it("STT: unsupported host returns the honest unsupported result", () => {
    const result = createSpeechRecognizer(
      {},
      { language: "en-US", onResult: () => {}, onError: () => {} }
    );
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toMatch(/no built-in speech recognition/);
  });

  it("STT: streams final + interim results with the chosen language", () => {
    let instance: Record<string, unknown> | null = null;
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 0;
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      constructor() {
        instance = this as unknown as Record<string, unknown>;
      }
      start() {}
      stop() {}
      abort() {}
    }
    const seen: Array<{ finalText: string; interimText: string }> = [];
    const created = createSpeechRecognizer(
      { SpeechRecognition: FakeRecognition },
      {
        language: "es-MX",
        onResult: (e) => seen.push(e),
        onError: () => {},
      }
    );
    expect(created.supported).toBe(true);
    expect(instance!.lang).toBe("es-MX");
    expect(instance!.continuous).toBe(true);
    expect(instance!.interimResults).toBe(true);
    const onresult = instance!.onresult as (e: unknown) => void;
    onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Hola " }], { isFinal: false, length: 1 }),
      ],
    });
    onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Hola mundo" }], { isFinal: true, length: 1 }),
      ],
    });
    expect(seen[0]).toEqual({ finalText: "", interimText: "Hola " });
    expect(seen[1]).toEqual({ finalText: "Hola mundo", interimText: "" });
  });

  it("TTS voice picking: exact locale, then primary subtag, then null", () => {
    const voices = [
      { lang: "en-US", name: "US Voice" },
      { lang: "fr-FR", name: "French Voice" },
    ];
    expect(pickVoiceForLanguage(voices, "fr-FR")?.name).toBe("French Voice");
    expect(pickVoiceForLanguage(voices, "en-GB")?.name).toBe("US Voice");
    expect(pickVoiceForLanguage(voices, "bn-BD")).toBeNull();
    expect(pickVoiceForLanguage([], "en-US")).toBeNull();
  });

  it("TTS: no synthesis → honest unsupported; no matching voice → honest reason", () => {
    const noSynth = speakText("Hello", "en-US", { synthesis: null });
    expect(noSynth.ok).toBe(false);
    const synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US", name: "US Voice" }],
    };
    const noVoice = speakText("হ্যালো", "bn-BD", {
      synthesis: synth,
      createUtterance: (t) => ({ text: t, lang: "", voice: null, rate: 1 }),
    });
    expect(noVoice.ok).toBe(false);
    if (!noVoice.ok) expect(noVoice.reason).toMatch(/no voice installed/);
    expect(synth.speak).not.toHaveBeenCalled();
    const ok = speakText("Hello", "en-US", {
      synthesis: synth,
      createUtterance: (t) => ({ text: t, lang: "", voice: null, rate: 1 }),
    });
    expect(ok.ok).toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});

// ── Attachments + step notes ───────────────────────────────────────────────

describe("voice attachments", () => {
  const tinyB64 = bytesToBase64(new TextEncoder().encode("fake-audio-bytes"));

  it("builds a valid attachment and labels the file by real type", () => {
    const built = buildVoiceAttachment({
      contentType: "audio/webm",
      contentBase64: tinyB64,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.attachment.contentType).toBe("audio/webm");
      expect(built.attachment.filename).toMatch(/^voice-note-.*\.webm$/);
      expect(built.attachment.contentBase64).toBe(tinyB64);
    }
    expect(voiceFileExtension("audio/mp4")).toBe("m4a");
    expect(voiceFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("refuses non-audio and empty payloads with reasons", () => {
    const notAudio = buildVoiceAttachment({
      contentType: "image/png",
      contentBase64: tinyB64,
    });
    expect(notAudio.ok).toBe(false);
    const empty = buildVoiceAttachment({
      contentType: "audio/webm",
      contentBase64: "",
    });
    expect(empty.ok).toBe(false);
  });

  it("data URL round-trip preserves type + bytes", () => {
    const url = audioDataUrl("audio/webm", tinyB64);
    const parsed = parseDataUrl(url);
    expect(parsed).toEqual({ contentType: "audio/webm", contentBase64: tinyB64 });
    expect(parseDataUrl("https://example.com/x.webm")).toBeNull();
  });

  it("parses step voice notes tolerantly and rejects junk", () => {
    const data = parseStepVoiceNote({
      source: "data",
      dataUrl: audioDataUrl("audio/webm", tinyB64),
      contentType: "audio/webm",
      durationSec: 9.6,
      language: "bn-BD",
    });
    expect(data?.source).toBe("data");
    expect(data?.durationSec).toBe(10);
    const storage = parseStepVoiceNote({
      source: "storage",
      path: "ws_1/note_1/voice.webm",
      contentType: "audio/webm",
    });
    expect(storage?.path).toBe("ws_1/note_1/voice.webm");
    expect(parseStepVoiceNote(null)).toBeNull();
    expect(parseStepVoiceNote({ source: "data" })).toBeNull();
    expect(parseStepVoiceNote({ source: "storage", path: "x", contentType: "text/plain" })).toBeNull();
  });

  it("resolves data-source notes inline; storage notes need the resolver", async () => {
    const note = parseStepVoiceNote({
      source: "data",
      dataUrl: audioDataUrl("audio/webm", tinyB64),
      contentType: "audio/webm",
      filename: "note.webm",
    })!;
    const inline = await resolveStepVoiceAttachment(note);
    expect(inline.ok).toBe(true);

    const stored = parseStepVoiceNote({
      source: "storage",
      path: "ws_1/note_1/voice.webm",
      contentType: "audio/webm",
      filename: "voice.webm",
    })!;
    const noResolver = await resolveStepVoiceAttachment(stored);
    expect(noResolver.ok).toBe(false);
    if (!noResolver.ok) expect(noResolver.error).toMatch(/no storage resolver/);
    const resolved = await resolveStepVoiceAttachment(stored, async () => ({
      filename: "voice.webm",
      contentType: "audio/webm",
      contentBase64: tinyB64,
    }));
    expect(resolved.ok).toBe(true);
  });
});

// ── Storage paths + upload ─────────────────────────────────────────────────

describe("voice storage helpers", () => {
  it("builds workspace-scoped paths and validates scope strictly", () => {
    expect(buildVoiceNotePath("ws_1", "note_1", "my note.webm")).toBe(
      "ws_1/note_1/my_note.webm"
    );
    expect(isWorkspaceVoicePath("ws_1", "ws_1/note_1/a.webm")).toBe(true);
    expect(isWorkspaceVoicePath("ws_1", "ws_2/note_1/a.webm")).toBe(false);
    expect(isWorkspaceVoicePath("ws_1", "ws_1/../ws_2/a.webm")).toBe(false);
    expect(isWorkspaceVoicePath("ws_1", "")).toBe(false);
  });

  it("uploads via the given admin client into the private bucket", async () => {
    const uploads: Array<{ bucket: string; path: string }> = [];
    const admin = {
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string) => {
            uploads.push({ bucket, path });
            return { error: null };
          },
        }),
      },
    };
    const result = await uploadVoiceNote(admin as never, {
      workspaceId: "ws_1",
      noteId: "note_1",
      filename: "voice.webm",
      contentType: "audio/webm",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(result.ok).toBe(true);
    expect(uploads).toEqual([
      { bucket: VOICE_NOTES_BUCKET, path: "ws_1/note_1/voice.webm" },
    ]);
    const refused = await uploadVoiceNote(admin as never, {
      workspaceId: "ws_1",
      noteId: "note_1",
      filename: "x.png",
      contentType: "image/png",
      bytes: new Uint8Array([1]),
    });
    expect(refused.ok).toBe(false);
  });
});
