import { describe, it, expect } from "vitest";
import {
  WARMUP_PRESETS,
  activeElapsedMs,
  cloneSchedule,
  currentPhase,
  deriveStatus,
  editScheduleTransition,
  effectiveCaps,
  emptyWarmupUsage,
  graduateTransition,
  isWarmupComplete,
  overrideTransition,
  parseWarmupHistory,
  parseWarmupOverrides,
  parseWarmupSchedule,
  pauseTransition,
  phaseDay,
  restartTransition,
  resumeTransition,
  scheduleTotalDays,
  startTransition,
  stepTypeToWarmupAction,
  warmupProgress,
  type AccountWarmupState,
} from "../warmup";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";
import type { WarmupLimits } from "@/types";

/**
 * Warm-up engine tests — pure, injected clock. Base instant is a
 * fixed UTC Monday; all program math is millisecond arithmetic.
 */

const T0 = new Date("2026-10-05T09:00:00.000Z");
const DAY = 86_400_000;
const at = (days: number, extraMs = 0) => new Date(T0.getTime() + days * DAY + extraMs);

function makeState(partial: Partial<AccountWarmupState> = {}): AccountWarmupState {
  return {
    accountId: "acc_1",
    displayName: "Alex Vance",
    enabled: true,
    status: "not_started",
    preset: null,
    schedule: null,
    overrides: null,
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    graduatedAt: null,
    dailyLimits: { ...DEFAULT_WARMUP_LIMITS },
    history: [],
    ...partial,
  };
}

/** A state as if Conservative was started at T0. */
function conservativeStarted(partial: Partial<AccountWarmupState> = {}): AccountWarmupState {
  const t = startTransition("conservative", T0, null);
  return makeState({
    status: "warming",
    preset: "conservative",
    schedule: t.patch.schedule ?? null,
    startedAt: T0.toISOString(),
    ...partial,
  });
}

describe("presets (audit §4.6 — exact tables)", () => {
  it("Conservative: 21 days, 4 phases, connections 5→8→12→15", () => {
    const p = WARMUP_PRESETS.conservative;
    expect(scheduleTotalDays(p.schedule)).toBe(21);
    expect(p.schedule.phases.map((f) => f.days)).toEqual([4, 5, 6, 6]);
    expect(p.schedule.phases.map((f) => f.caps.connection_requests)).toEqual([5, 8, 12, 15]);
    expect(p.schedule.phases[0].caps).toEqual({
      connection_requests: 5, messages: 5, profile_views: 15, like_post: 5, endorse_skills: 2, find_email: 5,
    });
    expect(p.schedule.phases[3].caps).toEqual({
      connection_requests: 15, messages: 20, profile_views: 40, like_post: 20, endorse_skills: 10, find_email: 20,
    });
  });

  it("Balanced: 18 days, 3 phases, connections 8→14→20", () => {
    const p = WARMUP_PRESETS.balanced;
    expect(scheduleTotalDays(p.schedule)).toBe(18);
    expect(p.schedule.phases.map((f) => f.days)).toEqual([5, 6, 7]);
    expect(p.schedule.phases.map((f) => f.caps.connection_requests)).toEqual([8, 14, 20]);
    expect(p.schedule.phases[2].caps).toEqual({
      connection_requests: 20, messages: 25, profile_views: 50, like_post: 25, endorse_skills: 12, find_email: 25,
    });
  });

  it("Accelerated: 12 days, 3 phases, connections 12→20→25, labelled for aged accounts", () => {
    const p = WARMUP_PRESETS.accelerated;
    expect(scheduleTotalDays(p.schedule)).toBe(12);
    expect(p.schedule.phases.map((f) => f.days)).toEqual([4, 4, 4]);
    expect(p.schedule.phases.map((f) => f.caps.connection_requests)).toEqual([12, 20, 25]);
    expect(p.schedule.phases[2].caps).toEqual({
      connection_requests: 25, messages: 35, profile_views: 60, like_post: 30, endorse_skills: 15, find_email: 30,
    });
    expect(p.blurb).toMatch(/aged, established accounts/i);
  });
});

describe("phase clock", () => {
  it("phaseDay is 0 before start and Day 1 on the start day", () => {
    expect(phaseDay(makeState(), T0)).toBe(0);
    const s = conservativeStarted();
    expect(phaseDay(s, T0)).toBe(1);
    expect(phaseDay(s, at(0, DAY - 1))).toBe(1);
    expect(phaseDay(s, at(1))).toBe(2);
    expect(phaseDay(s, at(20))).toBe(21);
    expect(phaseDay(s, at(21))).toBe(22);
  });

  it("currentPhase walks cumulative phase days", () => {
    const s = conservativeStarted();
    expect(currentPhase(s, at(0))).toMatchObject({ index: 0, dayInPhase: 1, programDay: 1, totalDays: 21 });
    expect(currentPhase(s, at(3))).toMatchObject({ index: 0, dayInPhase: 4 });
    expect(currentPhase(s, at(4))).toMatchObject({ index: 1, dayInPhase: 1, programDay: 5 });
    expect(currentPhase(s, at(9))).toMatchObject({ index: 2, dayInPhase: 1, programDay: 10 });
    expect(currentPhase(s, at(20))).toMatchObject({ index: 3, dayInPhase: 6, programDay: 21 });
    expect(currentPhase(s, at(21))).toBeNull();
    expect(currentPhase(makeState(), T0)).toBeNull();
  });

  it("pausing freezes the clock; resuming folds the span into pausedMs", () => {
    const s = conservativeStarted();
    const pause = pauseTransition(s, at(3), "user_1");
    expect(pause).not.toBeNull();
    const paused = makeState({
      ...s,
      status: "paused",
      pausedAt: pause!.patch.pausedAt ?? null,
    });
    // Ten wall-clock days later the program is still on Day 4.
    expect(phaseDay(paused, at(13))).toBe(4);
    expect(activeElapsedMs(paused, at(13))).toBe(3 * DAY);

    const resume = resumeTransition(paused, at(13), "user_1");
    expect(resume).not.toBeNull();
    expect(resume!.patch.pausedMs).toBe(10 * DAY);
    const resumed = makeState({
      ...s,
      pausedMs: resume!.patch.pausedMs ?? 0,
    });
    expect(phaseDay(resumed, at(13))).toBe(4);
    expect(phaseDay(resumed, at(14))).toBe(5);
  });

  it("multiple pauses compose", () => {
    let s = conservativeStarted();
    // Pause #1: days 2→5 (3 days), resume; pause #2: days 6→10 (4 days).
    const p1 = pauseTransition(s, at(2), null)!;
    s = makeState({ ...s, status: "paused", pausedAt: p1.patch.pausedAt! });
    const r1 = resumeTransition(s, at(5), null)!;
    s = makeState({ ...s, status: "warming", pausedAt: null, pausedMs: r1.patch.pausedMs! });
    const p2 = pauseTransition(s, at(6), null)!;
    s = makeState({ ...s, status: "paused", pausedAt: p2.patch.pausedAt! });
    const r2 = resumeTransition(s, at(10), null)!;
    expect(r2.patch.pausedMs).toBe(7 * DAY);
    s = makeState({ ...s, status: "warming", pausedAt: null, pausedMs: r2.patch.pausedMs! });
    // Active elapsed at day 10 = 10 − 7 = 3 days → Day 4.
    expect(phaseDay(s, at(10))).toBe(4);
  });

  it("graduation boundary: complete only once the day EXCEEDS the schedule", () => {
    const s = conservativeStarted();
    expect(isWarmupComplete(s, at(20))).toBe(false);
    expect(deriveStatus(s, at(20))).toBe("warming");
    expect(isWarmupComplete(s, at(21))).toBe(true);
    expect(deriveStatus(s, at(21))).toBe("graduated");
    // A paused program's frozen clock can complete only at its frozen day.
    const paused = makeState({ ...s, status: "paused", pausedAt: at(2).toISOString() });
    expect(isWarmupComplete(paused, at(60))).toBe(false);
  });
});

describe("effectiveCaps — min(daily limit, override ?? phase cap)", () => {
  it("not_started and graduated accounts are bound by the daily limits alone", () => {
    expect(effectiveCaps(makeState(), T0)).toEqual(DEFAULT_WARMUP_LIMITS);
    const grad = conservativeStarted({ status: "graduated", graduatedAt: at(21).toISOString() });
    expect(effectiveCaps(grad, at(21))).toEqual(DEFAULT_WARMUP_LIMITS);
  });

  it("warming: the phase cap binds when it is below the daily limit", () => {
    const s = conservativeStarted();
    // Phase 1 caps (5,5,15,5,2,5) vs daily defaults (5,10,20,20,20,20).
    expect(effectiveCaps(s, at(0))).toEqual({
      connection_requests: 5, messages: 5, profile_views: 15, like_post: 5, endorse_skills: 2, find_email: 5,
    });
  });

  it("the owner's daily limit binds when it is BELOW the phase cap", () => {
    const t = startTransition("balanced", T0, null);
    const s = makeState({
      status: "warming",
      preset: "balanced",
      schedule: t.patch.schedule ?? null,
      startedAt: T0.toISOString(),
      dailyLimits: { ...DEFAULT_WARMUP_LIMITS, connection_requests: 5 },
    });
    // Balanced phase 2 (day 6) allows 14 connections; stored limit is 5 → 5.
    expect(effectiveCaps(s, at(5)).connection_requests).toBe(5);
    // …while an action whose daily limit (25 default? no — defaults) …
    expect(effectiveCaps(s, at(5)).messages).toBe(10); // min(10 daily, 18 phase)
  });

  it("an override replaces the phase cap (still bounded by the daily limit)", () => {
    const s = conservativeStarted({ overrides: { connection_requests: 3, messages: 50 } });
    const caps = effectiveCaps(s, at(0));
    expect(caps.connection_requests).toBe(3); // min(5 daily, 3 override)
    expect(caps.messages).toBe(10); // min(10 daily, 50 override) — daily still wins
  });

  it("a paused program reports its frozen phase's caps", () => {
    const s = conservativeStarted({ status: "paused", pausedAt: at(4).toISOString() });
    // Frozen at Day 5 → phase 2 caps (8,10,20,10,5,10) vs daily defaults
    // (5,10,20,20,20,20): the daily 5 binds connections below the phase's 8.
    expect(effectiveCaps(s, at(30))).toEqual({
      connection_requests: 5, messages: 10, profile_views: 20, like_post: 10, endorse_skills: 5, find_email: 10,
    });
  });
});

describe("transitions", () => {
  it("start snapshots the preset — later mutation cannot rewrite the program", () => {
    const t = startTransition("conservative", T0, "user_1");
    expect(t.patch.status).toBe("warming");
    expect(t.patch.preset).toBe("conservative");
    expect(t.entry.action).toBe("started");
    t.patch.schedule!.phases[0].caps.connection_requests = 999;
    expect(WARMUP_PRESETS.conservative.schedule.phases[0].caps.connection_requests).toBe(5);
  });

  it("start with an explicit schedule records preset 'custom' only via edits — a custom start is 'custom'", () => {
    const custom = cloneSchedule(WARMUP_PRESETS.balanced.schedule);
    const t = startTransition(custom, T0, null);
    expect(t.patch.preset).toBe("custom");
    expect(t.patch.schedule).toEqual(custom);
  });

  it("pause/resume/restart validity follows the lifecycle", () => {
    const s = conservativeStarted();
    expect(resumeTransition(s, at(1), null)).toBeNull();
    expect(pauseTransition(makeState(), T0, null)).toBeNull();
    expect(restartTransition(makeState(), T0, null)).toBeNull();
    const r = restartTransition(s, at(9), "user_1");
    expect(r!.patch).toMatchObject({ status: "warming", pausedMs: 0, graduatedAt: null });
    expect(r!.patch.startedAt).toBe(at(9).toISOString());
    expect(r!.patch.schedule).toBeUndefined(); // schedule kept, not rewritten
    expect(r!.entry.action).toBe("restarted");
  });

  it("any schedule edit flips the preset to 'custom'", () => {
    const s = conservativeStarted();
    const edited = cloneSchedule(s.schedule!);
    edited.phases[0].days = 7;
    const t = editScheduleTransition(s, edited, at(2), "user_1");
    expect(t!.patch.preset).toBe("custom");
    expect(t!.patch.schedule!.phases[0].days).toBe(7);
    expect(t!.entry.action).toBe("schedule_edited");
    expect(editScheduleTransition(makeState(), edited, T0, null)).toBeNull();
  });

  it("override set + clear round-trips through the patch", () => {
    const s = conservativeStarted();
    const set = overrideTransition(s, "connection_requests", 3, at(1), "user_1");
    expect(set!.patch.overrides).toEqual({ connection_requests: 3 });
    expect(set!.entry.detail).toContain("pinned at 3");
    const withPin = makeState({ ...s, overrides: set!.patch.overrides });
    const cleared = overrideTransition(withPin, "connection_requests", null, at(2), "user_1");
    expect(cleared!.patch.overrides).toBeNull();
    expect(overrideTransition(makeState(), "messages", 5, T0, null)).toBeNull();
  });

  it("graduation: lazy vs marked_ready produce distinct history actions", () => {
    const s = conservativeStarted();
    const lazy = graduateTransition(s, at(21), null, "lazy");
    expect(lazy!.entry.action).toBe("graduated");
    expect(lazy!.patch).toMatchObject({ status: "graduated", graduatedAt: at(21).toISOString() });
    const ready = graduateTransition(s, at(3), "user_1", "marked_ready");
    expect(ready!.entry.action).toBe("marked_ready");
    expect(graduateTransition(makeState(), T0, null, "lazy")).toBeNull();
  });
});

describe("tolerant parsers (stored JSONB)", () => {
  it("schedule: junk → null; valid phases sanitised (days ≥ 1, caps filled)", () => {
    expect(parseWarmupSchedule(null)).toBeNull();
    expect(parseWarmupSchedule({ phases: [] })).toBeNull();
    expect(parseWarmupSchedule({ phases: [{ days: 0, caps: {} }] })).toBeNull();
    const parsed = parseWarmupSchedule({
      phases: [{ days: 3.9, caps: { connection_requests: 7 } }],
    });
    expect(parsed!.phases[0].days).toBe(3);
    expect(parsed!.phases[0].caps.connection_requests).toBe(7);
    expect(parsed!.phases[0].caps.messages).toBe(DEFAULT_WARMUP_LIMITS.messages);
  });

  it("overrides: only valid counters survive; empty → null", () => {
    expect(parseWarmupOverrides(null)).toBeNull();
    expect(parseWarmupOverrides({})).toBeNull();
    expect(parseWarmupOverrides({ messages: -4, like_post: 6.7, bogus: 1 }))
      .toEqual({ messages: 0, like_post: 6 });
  });

  it("history: junk entries dropped, valid ones kept in order", () => {
    const parsed = parseWarmupHistory([
      { action: "started", at: T0.toISOString(), by: "user_1" },
      { action: "exploded", at: T0.toISOString() },
      { action: "paused", at: 42 },
      "garbage",
      { action: "resumed", at: at(1).toISOString(), by: null, detail: "Day 2" },
    ]);
    expect(parsed.map((e) => e.action)).toEqual(["started", "resumed"]);
    expect(parsed[1].detail).toBe("Day 2");
    expect(parseWarmupHistory("nope")).toEqual([]);
  });
});

describe("action mapping + progress", () => {
  it("maps exactly the five LinkedIn step types; find_email is never enforced", () => {
    expect(stepTypeToWarmupAction("connection_request")).toBe("connection_requests");
    expect(stepTypeToWarmupAction("linkedin_message")).toBe("messages");
    expect(stepTypeToWarmupAction("view_profile")).toBe("profile_views");
    expect(stepTypeToWarmupAction("like_post")).toBe("like_post");
    expect(stepTypeToWarmupAction("endorse_skills")).toBe("endorse_skills");
    expect(stepTypeToWarmupAction("email")).toBeNull();
    expect(stepTypeToWarmupAction("wait")).toBeNull();
    expect(stepTypeToWarmupAction("condition")).toBeNull();
  });

  it("progress reports used/cap/pct against the effective caps", () => {
    const s = conservativeStarted();
    const usage = { ...emptyWarmupUsage(), connection_requests: 3, messages: 5 };
    const progress = warmupProgress(s, usage, at(0));
    expect(progress.connection_requests).toEqual({ used: 3, cap: 5, pct: 60 });
    expect(progress.messages).toEqual({ used: 5, cap: 5, pct: 100 });
    expect(progress.find_email.cap).toBe(5); // phase cap stored — displayed, unenforced
  });

  it("caps math sanity: every preset's final phase ≥ its first phase per action", () => {
    for (const preset of Object.values(WARMUP_PRESETS)) {
      const first = preset.schedule.phases[0].caps;
      const last = preset.schedule.phases[preset.schedule.phases.length - 1].caps;
      for (const key of Object.keys(first) as Array<keyof WarmupLimits>) {
        expect(last[key]).toBeGreaterThanOrEqual(first[key]);
      }
    }
  });
});
