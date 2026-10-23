/**
 * LinkedIn warm-up engine — pure, no DB, no clock of its own.
 *
 * A warm-up PROGRAM (migration 020) is a per-account ramp: a resolved
 * schedule of phases, each with per-action daily caps that grow over
 * ~2–3 weeks. This module owns everything derivable about a program:
 *
 *   - the three presets (starting points the owner snapshots into
 *     the account's `warmup_schedule` — programs never re-derive from
 *     these constants, so editing a preset never rewrites a running
 *     program);
 *   - the phase clock: Phase Day counts ACTIVE time only
 *     ((paused ? paused_at : now) − started_at − paused_ms), so
 *     pausing freezes the ramp and multiple pauses compose;
 *   - the effective cap per action: min(account daily limit,
 *     owner override ?? current phase cap). The owner's stored daily
 *     limit ALWAYS wins when lower — that is the safe direction;
 *   - the control transitions (start / pause / resume / restart /
 *     edit schedule / set override / graduate) as pure patch +
 *     history-entry computations the repository layer persists.
 *
 * Honesty rules baked in:
 *   - NO preset is "guaranteed safe" — copy says these are
 *     conservative starting points; LinkedIn's own limits and terms
 *     always apply.
 *   - `find_email` has a cap in every phase (parity with the stored
 *     limits UI) but NO sequence step type maps to it, so nothing
 *     enforces it — the mapping below never returns it, and surfaces
 *     label it "stored limit only". It becomes enforceable only if
 *     an enrichment action is ever routed through the executor gate.
 *   - Caps count a UTC day (the codebase's time discipline; there is
 *     no workspace-timezone concept in the product).
 */

import type {
  StepType,
  WarmupHistoryAction,
  WarmupHistoryEntry,
  WarmupLimits,
  WarmupPhase,
  WarmupPreset,
  WarmupSchedule,
  WarmupStatus,
} from "@/types";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** The six warm-up counters, in display order. */
export const WARMUP_ACTION_KEYS = Object.keys(DEFAULT_WARMUP_LIMITS) as Array<
  keyof WarmupLimits
>;

/**
 * Step type → governed warm-up action. `email`, `wait` and
 * `condition` are absent (not LinkedIn actions); `find_email` is
 * deliberately NEVER a value here — see the header.
 */
export const STEP_TYPE_TO_WARMUP_ACTION: Partial<
  Record<StepType, keyof WarmupLimits>
> = {
  connection_request: "connection_requests",
  linkedin_message: "messages",
  view_profile: "profile_views",
  like_post: "like_post",
  endorse_skills: "endorse_skills",
};

export function stepTypeToWarmupAction(
  stepType: StepType
): keyof WarmupLimits | null {
  return STEP_TYPE_TO_WARMUP_ACTION[stepType] ?? null;
}

/** Today's counted usage per action (derived from execution rows). */
export type WarmupUsageCounts = Record<keyof WarmupLimits, number>;

export function emptyWarmupUsage(): WarmupUsageCounts {
  return {
    connection_requests: 0,
    messages: 0,
    profile_views: 0,
    like_post: 0,
    endorse_skills: 0,
    find_email: 0,
  };
}

// ── Presets ─────────────────────────────────────────────────────────────────

export type WarmupPresetKey = Exclude<WarmupPreset, "custom">;

export interface WarmupPresetDef {
  key: WarmupPresetKey;
  label: string;
  blurb: string;
  schedule: WarmupSchedule;
}

function caps(
  connection_requests: number,
  messages: number,
  profile_views: number,
  like_post: number,
  endorse_skills: number,
  find_email: number
): WarmupLimits {
  return {
    connection_requests,
    messages,
    profile_views,
    like_post,
    endorse_skills,
    find_email,
  };
}

/**
 * Owner-editable starting points — NOT promises. Connection requests
 * ramp slowest (the most platform-sensitive action); views/likes
 * ramp fastest. Starting a program snapshots the chosen schedule
 * into the account row.
 */
export const WARMUP_PRESETS: Record<WarmupPresetKey, WarmupPresetDef> = {
  conservative: {
    key: "conservative",
    label: "Conservative",
    blurb:
      "21 days over 4 phases — the gentlest ramp, for new or cold accounts.",
    schedule: {
      phases: [
        { days: 4, caps: caps(5, 5, 15, 5, 2, 5) },
        { days: 5, caps: caps(8, 10, 20, 10, 5, 10) },
        { days: 6, caps: caps(12, 15, 30, 15, 8, 15) },
        { days: 6, caps: caps(15, 20, 40, 20, 10, 20) },
      ],
    },
  },
  balanced: {
    key: "balanced",
    label: "Balanced",
    blurb: "18 days over 3 phases — for a typical established account.",
    schedule: {
      phases: [
        { days: 5, caps: caps(8, 10, 20, 10, 5, 10) },
        { days: 6, caps: caps(14, 18, 35, 18, 8, 18) },
        { days: 7, caps: caps(20, 25, 50, 25, 12, 25) },
      ],
    },
  },
  accelerated: {
    key: "accelerated",
    label: "Accelerated",
    blurb:
      "12 days over 3 phases — for aged, established accounts with a sending history. Starts high; use it only on accounts that have one.",
    schedule: {
      phases: [
        { days: 4, caps: caps(12, 15, 30, 15, 8, 15) },
        { days: 4, caps: caps(20, 25, 50, 25, 12, 25) },
        { days: 4, caps: caps(25, 35, 60, 30, 15, 30) },
      ],
    },
  },
};

export const WARMUP_PRESET_NOTE =
  "Presets are conservative starting points you can edit — not a guarantee of safety. LinkedIn's own limits and terms always apply.";

export function cloneSchedule(schedule: WarmupSchedule): WarmupSchedule {
  return {
    phases: schedule.phases.map((p) => ({ days: p.days, caps: { ...p.caps } })),
  };
}

export function scheduleTotalDays(schedule: WarmupSchedule | null): number {
  if (!schedule) return 0;
  return schedule.phases.reduce((sum, p) => sum + Math.max(0, p.days), 0);
}

// ── Tolerant readers (stored JSONB may be partial or hand-edited) ──────────

function clampCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

/** Full limits: valid counters kept, missing/invalid fall back to the defaults. */
export function sanitizeWarmupLimitsFull(value: unknown): WarmupLimits {
  const out = { ...DEFAULT_WARMUP_LIMITS };
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of WARMUP_ACTION_KEYS) {
      const v = clampCount(rec[key]);
      if (v !== null) out[key] = v;
    }
  }
  return out;
}

/** Partial limits (owner override pins): only valid counters survive. */
export function sanitizeWarmupLimitsPartial(
  value: unknown
): Partial<WarmupLimits> {
  const out: Partial<WarmupLimits> = {};
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of WARMUP_ACTION_KEYS) {
      const v = clampCount(rec[key]);
      if (v !== null) out[key] = v;
    }
  }
  return out;
}

/** Parses a stored `warmup_schedule`; null when absent or unusable. */
export function parseWarmupSchedule(value: unknown): WarmupSchedule | null {
  if (!value || typeof value !== "object") return null;
  const phases = (value as { phases?: unknown }).phases;
  if (!Array.isArray(phases) || phases.length === 0) return null;
  const out: WarmupPhase[] = [];
  for (const raw of phases) {
    if (!raw || typeof raw !== "object") return null;
    const days = clampCount((raw as { days?: unknown }).days);
    if (days === null || days < 1) return null;
    out.push({
      days,
      caps: sanitizeWarmupLimitsFull((raw as { caps?: unknown }).caps),
    });
  }
  return { phases: out };
}

/** Parses stored `warmup_overrides`; null when no pin survives. */
export function parseWarmupOverrides(
  value: unknown
): Partial<WarmupLimits> | null {
  const partial = sanitizeWarmupLimitsPartial(value);
  return Object.keys(partial).length > 0 ? partial : null;
}

const HISTORY_ACTIONS: ReadonlySet<string> = new Set<WarmupHistoryAction>([
  "started",
  "paused",
  "resumed",
  "restarted",
  "schedule_edited",
  "override_set",
  "graduated",
  "marked_ready",
]);

/** Parses stored `warmup_history`; junk entries are dropped, never fatal. */
export function parseWarmupHistory(value: unknown): WarmupHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: WarmupHistoryEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    if (!HISTORY_ACTIONS.has(String(rec.action))) continue;
    if (typeof rec.at !== "string" || !rec.at) continue;
    out.push({
      action: rec.action as WarmupHistoryAction,
      at: rec.at,
      by: typeof rec.by === "string" && rec.by ? rec.by : null,
      ...(typeof rec.detail === "string" && rec.detail
        ? { detail: rec.detail }
        : {}),
    });
  }
  return out;
}

const WARMUP_STATUSES: ReadonlySet<string> = new Set<WarmupStatus>([
  "not_started",
  "warming",
  "paused",
  "graduated",
]);

export function parseWarmupStatus(value: unknown): WarmupStatus {
  return WARMUP_STATUSES.has(String(value))
    ? (value as WarmupStatus)
    : "not_started";
}

const WARMUP_PRESETS_SET: ReadonlySet<string> = new Set<WarmupPreset>([
  "conservative",
  "balanced",
  "accelerated",
  "custom",
]);

export function parseWarmupPreset(value: unknown): WarmupPreset | null {
  return WARMUP_PRESETS_SET.has(String(value))
    ? (value as WarmupPreset)
    : null;
}

// ── Program state ───────────────────────────────────────────────────────────

/**
 * Everything the engine needs about one account's program, resolved
 * by the data layer (dailyLimits already merged over the defaults).
 */
export interface AccountWarmupState {
  accountId: string;
  displayName: string;
  /** The master opt-in (`warmup_enabled`). The gate needs this AND status='warming'. */
  enabled: boolean;
  status: WarmupStatus;
  preset: WarmupPreset | null;
  schedule: WarmupSchedule | null;
  overrides: Partial<WarmupLimits> | null;
  startedAt: string | null;
  pausedAt: string | null;
  pausedMs: number;
  graduatedAt: string | null;
  dailyLimits: WarmupLimits;
  history: WarmupHistoryEntry[];
}

const DAY_MS = 86_400_000;

/**
 * Milliseconds of ACTIVE program time elapsed at `now`. While paused
 * the clock is frozen at `pausedAt`; accumulated earlier pauses
 * (`pausedMs`) never count.
 */
export function activeElapsedMs(state: AccountWarmupState, now: Date): number {
  if (!state.startedAt) return 0;
  const start = new Date(state.startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const end =
    state.status === "paused" && state.pausedAt
      ? new Date(state.pausedAt).getTime()
      : now.getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - start - Math.max(0, state.pausedMs));
}

/**
 * The program day at `now` (Day 1 = the start day). 0 when the
 * program has not started. May exceed the schedule's total days —
 * that is exactly the graduation condition.
 */
export function phaseDay(state: AccountWarmupState, now: Date): number {
  if (state.status === "not_started" || !state.startedAt) return 0;
  return Math.floor(activeElapsedMs(state, now) / DAY_MS) + 1;
}

export interface WarmupPhasePosition {
  /** 0-based phase index within the schedule. */
  index: number;
  phase: WarmupPhase;
  /** 1-based day within this phase. */
  dayInPhase: number;
  /** 1-based program day (== phaseDay). */
  programDay: number;
  totalDays: number;
}

/**
 * Where the program sits in its schedule at `now`; null when not
 * started, when there is no schedule, or when the program day has
 * run past the schedule (graduation territory).
 */
export function currentPhase(
  state: AccountWarmupState,
  now: Date
): WarmupPhasePosition | null {
  if (!state.schedule || state.schedule.phases.length === 0) return null;
  const day = phaseDay(state, now);
  if (day < 1) return null;
  const totalDays = scheduleTotalDays(state.schedule);
  if (day > totalDays) return null;
  let remaining = day;
  for (let i = 0; i < state.schedule.phases.length; i++) {
    const phase = state.schedule.phases[i];
    if (remaining <= phase.days) {
      return {
        index: i,
        phase,
        dayInPhase: remaining,
        programDay: day,
        totalDays,
      };
    }
    remaining -= phase.days;
  }
  return null;
}

/** True when an in-flight program's schedule has fully elapsed at `now`. */
export function isWarmupComplete(state: AccountWarmupState, now: Date): boolean {
  if (state.status !== "warming" && state.status !== "paused") return false;
  if (!state.schedule) return false;
  return phaseDay(state, now) > scheduleTotalDays(state.schedule);
}

/**
 * The status a reader should treat as in force at `now`: graduation
 * is LAZY — a warming/paused program whose schedule has elapsed IS
 * graduated, whether or not the transition has been persisted yet
 * (the executor gate and the panel persist it when they observe it).
 */
export function deriveStatus(
  state: AccountWarmupState,
  now: Date
): WarmupStatus {
  if (isWarmupComplete(state, now)) return "graduated";
  return state.status;
}

/**
 * The caps that actually bind today, per action:
 *   - not_started / graduated → the stored daily limits themselves;
 *   - warming / paused → min(daily limit, override ?? phase cap).
 * Paused programs report the caps of their frozen phase (they bind
 * again on resume; the gate itself does not engage while paused).
 */
export function effectiveCaps(
  state: AccountWarmupState,
  now: Date
): WarmupLimits {
  const status = deriveStatus(state, now);
  if (status !== "warming" && status !== "paused") {
    return { ...state.dailyLimits };
  }
  const position = currentPhase(state, now);
  if (!position) return { ...state.dailyLimits };
  const out = { ...state.dailyLimits };
  for (const key of WARMUP_ACTION_KEYS) {
    const phaseCap = position.phase.caps[key];
    const pinned = state.overrides?.[key];
    out[key] = Math.min(
      state.dailyLimits[key],
      typeof pinned === "number" ? pinned : phaseCap
    );
  }
  return out;
}

export interface WarmupActionProgress {
  used: number;
  cap: number;
  /** 0–100, for progress bars. */
  pct: number;
}

/** Per-action usage vs the effective cap, for the Accounts panel strip. */
export function warmupProgress(
  state: AccountWarmupState,
  usageToday: WarmupUsageCounts,
  now: Date
): Record<keyof WarmupLimits, WarmupActionProgress> {
  const caps = effectiveCaps(state, now);
  const out = {} as Record<keyof WarmupLimits, WarmupActionProgress>;
  for (const key of WARMUP_ACTION_KEYS) {
    const cap = caps[key];
    const used = Math.max(0, Math.floor(usageToday[key] ?? 0));
    out[key] = {
      used,
      cap,
      pct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : used > 0 ? 100 : 0,
    };
  }
  return out;
}

// ── Control transitions (pure patch + history entry) ────────────────────────

/** The program fields a control action may change (camelCase engine shape). */
export interface WarmupProgramPatch {
  status?: WarmupStatus;
  preset?: WarmupPreset | null;
  schedule?: WarmupSchedule | null;
  overrides?: Partial<WarmupLimits> | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  pausedMs?: number;
  graduatedAt?: string | null;
}

export interface WarmupTransition {
  patch: WarmupProgramPatch;
  entry: WarmupHistoryEntry;
}

function entry(
  action: WarmupHistoryAction,
  now: Date,
  by: string | null,
  detail?: string
): WarmupHistoryEntry {
  return {
    action,
    at: now.toISOString(),
    by,
    ...(detail ? { detail } : {}),
  };
}

/**
 * Starts a program. `choice` is a preset key (snapshotted) or an
 * explicit schedule (a custom start — preset flips to 'custom' on
 * the first edit, per the edit rule). Any previous program is
 * replaced: clock reset, overrides cleared.
 */
export function startTransition(
  choice: WarmupPresetKey | WarmupSchedule,
  now: Date,
  by: string | null
): WarmupTransition {
  const isPreset = typeof choice === "string";
  const preset: WarmupPreset = isPreset ? choice : "custom";
  const schedule = isPreset
    ? cloneSchedule(WARMUP_PRESETS[choice].schedule)
    : cloneSchedule(choice);
  return {
    patch: {
      status: "warming",
      preset,
      schedule,
      overrides: null,
      startedAt: now.toISOString(),
      pausedAt: null,
      pausedMs: 0,
      graduatedAt: null,
    },
    entry: entry(
      "started",
      now,
      by,
      isPreset
        ? `${WARMUP_PRESETS[choice].label} preset (${scheduleTotalDays(schedule)} days)`
        : `Custom schedule (${scheduleTotalDays(schedule)} days)`
    ),
  };
}

/** Pauses a warming program — its clock freezes at `now`. */
export function pauseTransition(
  state: AccountWarmupState,
  now: Date,
  by: string | null
): WarmupTransition | null {
  if (state.status !== "warming") return null;
  return {
    patch: { status: "paused", pausedAt: now.toISOString() },
    entry: entry("paused", now, by, `Day ${phaseDay(state, now)}`),
  };
}

/** Resumes a paused program — the paused span folds into pausedMs. */
export function resumeTransition(
  state: AccountWarmupState,
  now: Date,
  by: string | null
): WarmupTransition | null {
  if (state.status !== "paused" || !state.pausedAt) return null;
  const pausedSpan = Math.max(
    0,
    now.getTime() - new Date(state.pausedAt).getTime()
  );
  return {
    patch: {
      status: "warming",
      pausedAt: null,
      pausedMs: Math.max(0, state.pausedMs) + pausedSpan,
    },
    entry: entry("resumed", now, by, `Day ${phaseDay(state, now)}`),
  };
}

/** Restarts the program at Day 1, keeping schedule, preset and overrides. */
export function restartTransition(
  state: AccountWarmupState,
  now: Date,
  by: string | null
): WarmupTransition | null {
  if (state.status === "not_started" || !state.schedule) return null;
  return {
    patch: {
      status: "warming",
      startedAt: now.toISOString(),
      pausedAt: null,
      pausedMs: 0,
      graduatedAt: null,
    },
    entry: entry("restarted", now, by, "Back to Day 1 — schedule kept"),
  };
}

/**
 * Replaces the schedule in force. ANY edit flips the preset to
 * 'custom' — the program no longer matches a named preset.
 */
export function editScheduleTransition(
  state: AccountWarmupState,
  schedule: WarmupSchedule,
  now: Date,
  by: string | null
): WarmupTransition | null {
  if (state.status === "not_started") return null;
  const clean = parseWarmupSchedule(schedule);
  if (!clean) return null;
  return {
    patch: { schedule: clean, preset: "custom" },
    entry: entry(
      "schedule_edited",
      now,
      by,
      `${clean.phases.length} phase(s), ${scheduleTotalDays(clean)} days total`
    ),
  };
}

/** Pins (value) or clears (null) one action's cap, replacing its phase cap. */
export function overrideTransition(
  state: AccountWarmupState,
  action: keyof WarmupLimits,
  value: number | null,
  now: Date,
  by: string | null
): WarmupTransition | null {
  if (state.status === "not_started") return null;
  const next: Partial<WarmupLimits> = { ...(state.overrides ?? {}) };
  let detail: string;
  if (value === null) {
    delete next[action];
    detail = `${action} pin cleared — the phase cap applies again`;
  } else {
    const clamped = clampCount(value);
    if (clamped === null) return null;
    next[action] = clamped;
    detail = `${action} pinned at ${clamped}/day`;
  }
  return {
    patch: {
      overrides: Object.keys(next).length > 0 ? next : null,
    },
    entry: entry("override_set", now, by, detail),
  };
}

/**
 * Graduates a program. `via: 'marked_ready'` is the owner's explicit
 * action; `via: 'lazy'` is the system recording an elapsed schedule
 * (the executor gate / panel persist it when they first observe it).
 */
export function graduateTransition(
  state: AccountWarmupState,
  now: Date,
  by: string | null,
  via: "lazy" | "marked_ready"
): WarmupTransition | null {
  if (state.status !== "warming" && state.status !== "paused") return null;
  const openPause =
    state.status === "paused" && state.pausedAt
      ? Math.max(0, now.getTime() - new Date(state.pausedAt).getTime())
      : 0;
  return {
    patch: {
      status: "graduated",
      graduatedAt: now.toISOString(),
      pausedAt: null,
      pausedMs: Math.max(0, state.pausedMs) + openPause,
    },
    entry: entry(
      via === "marked_ready" ? "marked_ready" : "graduated",
      now,
      by,
      via === "marked_ready"
        ? "Marked ready by the account owner"
        : "Schedule complete"
    ),
  };
}
