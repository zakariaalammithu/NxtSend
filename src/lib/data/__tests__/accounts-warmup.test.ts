import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createAccountsRepository,
  editWarmupSchedule,
  markWarmupReady,
  pauseWarmup,
  recordWarmupGraduation,
  restartWarmup,
  resumeWarmup,
  setWarmupOverride,
  startWarmup,
  warmupStateOf,
  DEMO_EMAIL_ACCOUNT_ID,
  DEMO_LINKEDIN_ACCOUNT_ID,
} from "@/lib/data/accounts";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import {
  WARMUP_PRESETS,
  cloneSchedule,
  deriveStatus,
  effectiveCaps,
  phaseDay,
} from "@/lib/linkedin/warmup";
import { dayPeriodStartIso } from "@/lib/executor/core";

/**
 * Warm-up program control helpers over the DEMO accounts repository
 * (the helpers are backend-agnostic — getAccount + updateAccount —
 * so this exercises the exact code the Supabase backend runs).
 */

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

const repo = () => createAccountsRepository("demo");
const NOW = new Date("2026-10-19T10:00:00.000Z");
const DAY = 86_400_000;

describe("demo seed fixture", () => {
  it("the demo LinkedIn account is mid-program: Day 3 of Conservative, warming", async () => {
    const account = await repo().getAccount(
      DEMO_WORKSPACE_ID,
      DEMO_LINKEDIN_ACCOUNT_ID
    );
    expect(account).not.toBeNull();
    expect(account!.warmup_status).toBe("warming");
    expect(account!.warmup_preset).toBe("conservative");
    expect(account!.warmup_schedule).toEqual(
      WARMUP_PRESETS.conservative.schedule
    );
    expect(account!.warmup_history.map((h) => h.action)).toEqual(["started"]);
    const state = warmupStateOf(account!);
    // Seeded started_at is ~2 days before first seed: Day 3 (allow
    // the neighbouring day if the test runs across a boundary).
    expect([3, 4]).toContain(phaseDay(state, new Date()));
    expect(deriveStatus(state, new Date())).toBe("warming");
  });

  it("the demo email account has no program", async () => {
    const account = await repo().getAccount(
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID
    );
    expect(account!.warmup_status).toBe("not_started");
    expect(account!.warmup_schedule).toBeNull();
    expect(account!.warmup_history).toEqual([]);
  });

  it("seeded today-usage: 3 connection attempts counted for the demo account", async () => {
    const counts = await repo().countLinkedInActionsToday(
      DEMO_WORKSPACE_ID,
      DEMO_LINKEDIN_ACCOUNT_ID,
      dayPeriodStartIso(new Date())
    );
    expect(counts.connection_requests).toBe(3);
    expect(counts.messages).toBe(0);
    expect(counts.find_email).toBe(0);
    // Below the phase-1 effective cap of 5 — room for 2 more today.
    const account = await repo().getAccount(
      DEMO_WORKSPACE_ID,
      DEMO_LINKEDIN_ACCOUNT_ID
    );
    expect(
      effectiveCaps(warmupStateOf(account!), new Date()).connection_requests
    ).toBe(5);
  });
});

describe("control helpers", () => {
  it("start → pause → resume persists state + history through the repo", async () => {
    const r = repo();
    const started = await startWarmup(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      "balanced",
      { by: "user_1", now: NOW }
    );
    expect(started!.warmup_status).toBe("warming");
    expect(started!.warmup_preset).toBe("balanced");
    expect(started!.warmup_started_at).toBe(NOW.toISOString());

    const paused = await pauseWarmup(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { by: "user_1", now: new Date(NOW.getTime() + 2 * DAY) }
    );
    expect(paused!.warmup_status).toBe("paused");
    expect(paused!.warmup_paused_at).toBe(
      new Date(NOW.getTime() + 2 * DAY).toISOString()
    );

    const resumed = await resumeWarmup(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { by: "user_1", now: new Date(NOW.getTime() + 5 * DAY) }
    );
    expect(resumed!.warmup_status).toBe("warming");
    expect(resumed!.warmup_paused_at).toBeNull();
    expect(resumed!.warmup_paused_ms).toBe(3 * DAY);
    expect(resumed!.warmup_history.map((h) => h.action)).toEqual([
      "started",
      "paused",
      "resumed",
    ]);
    expect(resumed!.warmup_history.every((h) => h.by === "user_1")).toBe(true);
    // Clock check: 5 wall days − 3 paused = Day 3 of the program.
    expect(phaseDay(warmupStateOf(resumed!), new Date(NOW.getTime() + 5 * DAY))).toBe(3);
  });

  it("an inapplicable transition returns the account unchanged", async () => {
    const r = repo();
    const before = await r.getAccount(DEMO_WORKSPACE_ID, DEMO_EMAIL_ACCOUNT_ID);
    const after = await pauseWarmup(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { now: NOW }
    );
    expect(after!.warmup_status).toBe("not_started");
    expect(after!.warmup_history).toEqual(before!.warmup_history);
    expect(
      await startWarmup(r, DEMO_WORKSPACE_ID, "acc_missing", "balanced", {
        now: NOW,
      })
    ).toBeNull();
  });

  it("editing the schedule flips the preset to custom; overrides set + clear", async () => {
    const r = repo();
    await startWarmup(r, DEMO_WORKSPACE_ID, DEMO_EMAIL_ACCOUNT_ID, "conservative", {
      now: NOW,
    });
    const edited = cloneSchedule(WARMUP_PRESETS.conservative.schedule);
    edited.phases[0].caps.connection_requests = 4;
    const afterEdit = await editWarmupSchedule(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      edited,
      { now: NOW }
    );
    expect(afterEdit!.warmup_preset).toBe("custom");
    expect(afterEdit!.warmup_schedule!.phases[0].caps.connection_requests).toBe(4);

    const pinned = await setWarmupOverride(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      "messages",
      3,
      { now: NOW }
    );
    expect(pinned!.warmup_overrides).toEqual({ messages: 3 });
    const cleared = await setWarmupOverride(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      "messages",
      null,
      { now: NOW }
    );
    expect(cleared!.warmup_overrides).toBeNull();
    expect(
      cleared!.warmup_history.map((h) => h.action)
    ).toEqual(["started", "schedule_edited", "override_set", "override_set"]);
  });

  it("restart keeps the schedule and resets the clock; mark ready graduates now", async () => {
    const r = repo();
    await startWarmup(r, DEMO_WORKSPACE_ID, DEMO_EMAIL_ACCOUNT_ID, "accelerated", {
      now: NOW,
    });
    const restarted = await restartWarmup(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { now: new Date(NOW.getTime() + 9 * DAY) }
    );
    expect(restarted!.warmup_status).toBe("warming");
    expect(restarted!.warmup_schedule).toEqual(
      WARMUP_PRESETS.accelerated.schedule
    );
    expect(
      phaseDay(warmupStateOf(restarted!), new Date(NOW.getTime() + 9 * DAY))
    ).toBe(1);

    const ready = await markWarmupReady(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { by: "user_1", now: new Date(NOW.getTime() + 10 * DAY) }
    );
    expect(ready!.warmup_status).toBe("graduated");
    expect(ready!.warmup_graduated_at).toBe(
      new Date(NOW.getTime() + 10 * DAY).toISOString()
    );
    expect(ready!.warmup_history.at(-1)?.action).toBe("marked_ready");
  });

  it("recordWarmupGraduation writes the lazy 'graduated' entry", async () => {
    const r = repo();
    await startWarmup(r, DEMO_WORKSPACE_ID, DEMO_EMAIL_ACCOUNT_ID, "accelerated", {
      now: NOW,
    });
    const graduated = await recordWarmupGraduation(
      r,
      DEMO_WORKSPACE_ID,
      DEMO_EMAIL_ACCOUNT_ID,
      { now: new Date(NOW.getTime() + 12 * DAY) }
    );
    expect(graduated!.warmup_status).toBe("graduated");
    expect(graduated!.warmup_history.at(-1)?.action).toBe("graduated");
    expect(graduated!.warmup_history.at(-1)?.by).toBeNull();
  });
});
