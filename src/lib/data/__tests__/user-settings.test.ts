import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createUserSettingsRepository } from "@/lib/data/user-settings";
import { DEMO_USER_ID } from "@/lib/data/workspace";
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_STORED_PREFS,
  normalizeStoredPrefs,
  validateProfilePatch,
  validatePasswordChange,
} from "@/lib/user-settings/core";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("user-settings core", () => {
  it("normalizes stored prefs over defaults, dropping unknown keys", () => {
    const prefs = normalizeStoredPrefs({ daily_digest: true, bogus: 1 });
    expect(prefs.daily_digest).toBe(true);
    expect(prefs.notify_replies).toBe(DEFAULT_USER_PREFERENCES.notify_replies);
    expect(prefs).not.toHaveProperty("bogus");
    expect(normalizeStoredPrefs(null)).toEqual(DEFAULT_STORED_PREFS);
    expect(normalizeStoredPrefs("junk")).toEqual(DEFAULT_STORED_PREFS);
    // Non-boolean toggles fall back to defaults; bio is capped at 280.
    const coerced = normalizeStoredPrefs({
      notify_replies: "yes",
      bio: "x".repeat(300),
    });
    expect(coerced.notify_replies).toBe(DEFAULT_USER_PREFERENCES.notify_replies);
    expect(coerced.bio).toHaveLength(280);
  });

  it("validates profile patches (name trimmed + length, bio cap)", () => {
    expect(validateProfilePatch({ full_name: " A ", bio: "" }).ok).toBe(false);
    const ok = validateProfilePatch({ full_name: "  Alex Vance ", bio: " hi " });
    // Name is trimmed; bio is stored verbatim (length-checked only).
    expect(ok).toEqual({
      ok: true,
      value: { full_name: "Alex Vance", bio: " hi " },
    });
    expect(
      validateProfilePatch({ full_name: "Alex", bio: "x".repeat(281) }).ok
    ).toBe(false);
  });

  it("validates password changes (>= 8 chars, must match)", () => {
    expect(validatePasswordChange({ newPassword: "short", confirmPassword: "short" })).toEqual({
      ok: false,
      error: expect.stringContaining("8 characters"),
    });
    expect(
      validatePasswordChange({ newPassword: "longenough1", confirmPassword: "different1" }).ok
    ).toBe(false);
    expect(
      validatePasswordChange({ newPassword: "longenough1", confirmPassword: "longenough1" })
    ).toEqual({ ok: true, value: "longenough1" });
  });
});

describe("DemoUserSettingsRepository", () => {
  it("seeds the demo persona", async () => {
    const repo = createUserSettingsRepository("demo");
    const data = await repo.getSettings();
    expect(repo.mode).toBe("demo");
    expect(data.identity.id).toBe(DEMO_USER_ID);
    expect(data.identity.email).toBe("alex@nxtsend.com");
    expect(data.identity.full_name).toBe("Alex Vance");
    expect(data.preferences).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("persists profile + preferences across repository instances", async () => {
    const repo = createUserSettingsRepository("demo");
    await repo.updateProfile({ full_name: "Alexandra Vance", bio: "New bio" });
    await repo.updatePreferences({
      ...DEFAULT_USER_PREFERENCES,
      daily_digest: true,
      notify_replies: false,
    });

    // A fresh instance over the same store sees the saved values —
    // this is what makes a page reload keep the change.
    const fresh = createUserSettingsRepository("demo");
    const data = await fresh.getSettings();
    expect(data.identity.full_name).toBe("Alexandra Vance");
    expect(data.bio).toBe("New bio");
    expect(data.preferences.daily_digest).toBe(true);
    expect(data.preferences.notify_replies).toBe(false);
  });

  it("rejects invalid profile patches without saving", async () => {
    const repo = createUserSettingsRepository("demo");
    await expect(
      repo.updateProfile({ full_name: "x", bio: "" })
    ).rejects.toThrow("Full name must be 2–80 characters.");
    const data = await repo.getSettings();
    expect(data.identity.full_name).toBe("Alex Vance");
  });

  it("refuses password changes honestly in demo mode", async () => {
    const repo = createUserSettingsRepository("demo");
    const result = await repo.changePassword("longenough1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Demo Mode/);
  });
});
