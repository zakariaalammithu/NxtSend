/**
 * Safety settings repository (migration 022) — dual backend, demo
 * mode exercised here through the in-memory demo store.
 *
 * Pins: defaults when no row exists, save round-trips, and the
 * tolerant reader (out-of-range caps clamp, bad times/days fall back
 * to defaults, corrupted payloads reseed to defaults).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage, getDemoStorage } from "../demo-store";
import {
  createSafetySettingsRepository,
  defaultSafetySettings,
  normalizeSafetySettings,
  DEMO_SAFETY_SETTINGS_KEY,
} from "../safety-settings";
import { DEMO_WORKSPACE_ID } from "../workspace";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

const repo = () => createSafetySettingsRepository("demo");

describe("get — defaults when no row exists", () => {
  it("returns cap 15, 09:00–18:00, Mon–Fri, ramp-up on", async () => {
    const settings = await repo().get(DEMO_WORKSPACE_ID);
    expect(settings).toEqual(defaultSafetySettings(DEMO_WORKSPACE_ID));
    expect(settings.daily_connection_cap).toBe(15);
    expect(settings.working_hours_start).toBe("09:00");
    expect(settings.working_hours_end).toBe("18:00");
    expect(settings.working_days).toEqual([1, 2, 3, 4, 5]);
    expect(settings.ramp_up_enabled).toBe(true);
  });
});

describe("save — round-trip and merge", () => {
  it("persists a full patch and reads it back", async () => {
    const saved = await repo().save(DEMO_WORKSPACE_ID, {
      daily_connection_cap: 10,
      working_hours_start: "08:30",
      working_hours_end: "17:00",
      working_days: [1, 2, 3],
      ramp_up_enabled: false,
    });
    expect(saved.daily_connection_cap).toBe(10);
    expect(saved.working_hours_start).toBe("08:30");
    expect(saved.working_hours_end).toBe("17:00");
    expect(saved.working_days).toEqual([1, 2, 3]);
    expect(saved.ramp_up_enabled).toBe(false);

    const reloaded = await repo().get(DEMO_WORKSPACE_ID);
    expect(reloaded).toEqual(saved);
  });

  it("merges a partial patch over the current settings", async () => {
    await repo().save(DEMO_WORKSPACE_ID, { daily_connection_cap: 20 });
    const saved = await repo().save(DEMO_WORKSPACE_ID, {
      working_hours_end: "19:00",
    });
    expect(saved.daily_connection_cap).toBe(20);
    expect(saved.working_hours_end).toBe("19:00");
    expect(saved.working_hours_start).toBe("09:00");
    expect(saved.ramp_up_enabled).toBe(true);
  });

  it("a different workspace reads its own defaults, not another workspace's row", async () => {
    await repo().save(DEMO_WORKSPACE_ID, { daily_connection_cap: 5 });
    const other = await repo().get("ws_other");
    expect(other.daily_connection_cap).toBe(15);
    expect(other.workspace_id).toBe("ws_other");
  });
});

describe("normalizeSafetySettings — tolerant reader", () => {
  it("clamps the cap into 1–100", () => {
    expect(
      normalizeSafetySettings({ daily_connection_cap: 0 }, "ws_1")
        .daily_connection_cap
    ).toBe(1);
    expect(
      normalizeSafetySettings({ daily_connection_cap: 200 }, "ws_1")
        .daily_connection_cap
    ).toBe(100);
    expect(
      normalizeSafetySettings({ daily_connection_cap: 7.9 }, "ws_1")
        .daily_connection_cap
    ).toBe(7);
    expect(
      normalizeSafetySettings({ daily_connection_cap: "many" }, "ws_1")
        .daily_connection_cap
    ).toBe(15);
  });

  it("falls back to default times for unusable values, trims seconds from TIME columns", () => {
    const settings = normalizeSafetySettings(
      { working_hours_start: "09:00:00", working_hours_end: "25:00" },
      "ws_1"
    );
    expect(settings.working_hours_start).toBe("09:00");
    expect(settings.working_hours_end).toBe("18:00");
  });

  it("sanitizes working days: drops out-of-range values, dedupes, sorts; empty falls back", () => {
    expect(
      normalizeSafetySettings({ working_days: [5, 1, 5, 9, 0, "x"] }, "ws_1")
        .working_days
    ).toEqual([1, 5]);
    expect(
      normalizeSafetySettings({ working_days: [] }, "ws_1").working_days
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("a corrupted demo payload reads as defaults", async () => {
    getDemoStorage().setItem(DEMO_SAFETY_SETTINGS_KEY, "{not json");
    const settings = await repo().get(DEMO_WORKSPACE_ID);
    expect(settings).toEqual(defaultSafetySettings(DEMO_WORKSPACE_ID));
  });

  it("save clamps an out-of-range cap instead of storing it", async () => {
    const saved = await repo().save(DEMO_WORKSPACE_ID, {
      daily_connection_cap: 500,
    });
    expect(saved.daily_connection_cap).toBe(100);
  });
});
