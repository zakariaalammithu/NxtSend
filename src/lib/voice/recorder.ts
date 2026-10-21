/**
 * Voice recorder — a small state machine over MediaRecorder
 * (P6 Stage C).
 *
 * States: idle → recording ⇄ paused → stopped (a take exists) — and
 * error (permission denied / no device / unsupported). The class is
 * framework-free and takes its platform pieces (getUserMedia,
 * MediaRecorder constructor, clock) as injected deps so the machine
 * is fully unit-testable with fakes; the React component wires the
 * real browser implementations.
 *
 * Codec honesty: MediaRecorder's mimeType differs per browser
 * (Chrome: audio/webm; Safari: audio/mp4). The recorder asks for the
 * first supported candidate and reports the ACTUAL type of the
 * produced blob — attachments are labelled with the real type, never
 * a guessed one.
 */

export type RecorderState =
  | "idle"
  | "recording"
  | "paused"
  | "stopped"
  | "error";

export interface RecordedTake {
  blob: Blob;
  /** The MediaRecorder's actual mimeType for this take. */
  mimeType: string;
  durationSec: number;
}

export interface RecorderError {
  kind: "permission_denied" | "no_device" | "unsupported" | "failed";
  message: string;
}

export interface MediaRecorderLike {
  state: string;
  mimeType: string;
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface MediaStreamLike {
  getTracks(): Array<{ stop(): void }>;
}

export interface RecorderDeps {
  getUserMedia?: (constraints: { audio: boolean }) => Promise<MediaStreamLike>;
  createRecorder?: (
    stream: MediaStreamLike,
    options?: { mimeType?: string }
  ) => MediaRecorderLike;
  /** Injectable clock (ms) for duration math + tests. */
  now?: () => number;
  /** Candidate mimeTypes in preference order. */
  mimeCandidates?: string[];
  isTypeSupported?: (mimeType: string) => boolean;
}

export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

/** Hard cap for one voice note — keeps attachments + demo storage sane. */
export const MAX_RECORDING_SECONDS = 120;

export class VoiceRecorder {
  private readonly deps: Required<Pick<RecorderDeps, "now">> & RecorderDeps;
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStreamLike | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedTotalMs = 0;
  private pauseStartedAt: number | null = null;

  state: RecorderState = "idle";
  take: RecordedTake | null = null;
  error: RecorderError | null = null;
  private stopWaiters: Array<(take: RecordedTake | null) => void> = [];

  /**
   * Resolves with the finished take once stop() has finalized it
   * (MediaRecorder's onstop is asynchronous). Resolves null when the
   * take was discarded or recording failed.
   */
  whenStopped(): Promise<RecordedTake | null> {
    if (this.state === "stopped") return Promise.resolve(this.take);
    if (this.state === "idle" || this.state === "error") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => this.stopWaiters.push(resolve));
  }

  private settleStopWaiters(take: RecordedTake | null): void {
    const waiters = this.stopWaiters;
    this.stopWaiters = [];
    for (const resolve of waiters) resolve(take);
  }
  /** Set by the UI's ticker to enforce MAX_RECORDING_SECONDS. */
  onMaxDuration?: () => void;

  constructor(deps: RecorderDeps = {}) {
    this.deps = { now: () => Date.now(), ...deps };
  }

  /** Elapsed recording time in seconds (pauses excluded). */
  elapsedSec(): number {
    if (this.state === "recording") {
      return Math.max(
        0,
        (this.deps.now() - this.startedAt - this.pausedTotalMs) / 1000
      );
    }
    if (this.state === "paused") {
      return Math.max(
        0,
        ((this.pauseStartedAt ?? this.deps.now()) -
          this.startedAt -
          this.pausedTotalMs) /
          1000
      );
    }
    return this.take?.durationSec ?? 0;
  }

  async start(): Promise<boolean> {
    if (this.state === "recording" || this.state === "paused") return false;
    this.error = null;
    const { getUserMedia, createRecorder } = this.deps;
    if (!getUserMedia || !createRecorder) {
      this.fail(
        "unsupported",
        "Voice recording is not supported in this browser (MediaRecorder / microphone API missing)."
      );
      return false;
    }
    let stream: MediaStreamLike;
    try {
      stream = await getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.fail(
          "permission_denied",
          "Microphone permission was denied. Allow microphone access in your browser settings to record a voice note."
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        this.fail(
          "no_device",
          "No microphone was found on this device, so recording cannot start."
        );
      } else {
        this.fail(
          "failed",
          `The microphone could not be started (${err instanceof Error ? err.message : "unknown error"}).`
        );
      }
      return false;
    }
    this.stream = stream;
    const mimeType = this.pickMimeType();
    let recorder: MediaRecorderLike;
    try {
      recorder = createRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      this.releaseStream();
      this.fail(
        "failed",
        `The recorder could not be created (${err instanceof Error ? err.message : "unknown error"}).`
      );
      return false;
    }
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.onstop = () => this.finalizeTake();
    recorder.onerror = () => {
      this.fail("failed", "Recording failed in the browser. The take was discarded.");
      this.releaseStream();
    };
    this.startedAt = this.deps.now();
    this.pausedTotalMs = 0;
    this.pauseStartedAt = null;
    this.take = null;
    try {
      recorder.start(250);
    } catch (err) {
      this.releaseStream();
      this.fail(
        "failed",
        `Recording could not start (${err instanceof Error ? err.message : "unknown error"}).`
      );
      return false;
    }
    this.state = "recording";
    return true;
  }

  pause(): void {
    if (this.state !== "recording" || !this.recorder) return;
    try {
      this.recorder.pause();
    } catch {
      return;
    }
    this.pauseStartedAt = this.deps.now();
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused" || !this.recorder) return;
    try {
      this.recorder.resume();
    } catch {
      return;
    }
    if (this.pauseStartedAt !== null) {
      this.pausedTotalMs += this.deps.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
    this.state = "recording";
  }

  stop(): void {
    if ((this.state !== "recording" && this.state !== "paused") || !this.recorder) {
      return;
    }
    if (this.pauseStartedAt !== null) {
      this.pausedTotalMs += this.deps.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
    try {
      this.recorder.stop();
    } catch {
      this.finalizeTake();
    }
  }

  /** Discards the current take and returns to idle. */
  discard(): void {
    if (this.recorder && (this.state === "recording" || this.state === "paused")) {
      try {
        this.recorder.onstop = null;
        this.recorder.stop();
      } catch {
        // already stopped
      }
    }
    this.releaseStream();
    this.recorder = null;
    this.chunks = [];
    this.take = null;
    this.error = null;
    this.state = "idle";
    this.settleStopWaiters(null);
  }

  private pickMimeType(): string | undefined {
    const isSupported =
      this.deps.isTypeSupported ?? (() => true);
    const candidates = this.deps.mimeCandidates ?? [
      ...RECORDER_MIME_CANDIDATES,
    ];
    for (const candidate of candidates) {
      try {
        if (isSupported(candidate)) return candidate;
      } catch {
        // keep looking
      }
    }
    return undefined;
  }

  private finalizeTake(): void {
    const mimeType =
      this.recorder?.mimeType || this.chunks[0]?.type || "audio/webm";
    const durationSec = Math.max(
      0,
      Math.round(
        (this.deps.now() - this.startedAt - this.pausedTotalMs) / 1000
      )
    );
    const blob = new Blob(this.chunks, { type: mimeType });
    this.take = { blob, mimeType, durationSec };
    this.releaseStream();
    this.recorder = null;
    this.state = "stopped";
    this.settleStopWaiters(this.take);
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
  }

  private fail(kind: RecorderError["kind"], message: string): void {
    this.error = { kind, message };
    this.state = "error";
    this.settleStopWaiters(null);
  }
}

/** "0:42" display formatting for durations. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}
