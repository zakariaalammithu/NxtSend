/**
 * User settings repository — profile + preferences for the CURRENT
 * user (session-scoped; there is no workspace parameter because these
 * records belong to the person, not the workspace).
 *
 * - Supabase backend: full_name lives on the `profiles` row (updated
 *   through the session client — migration 002 grants users exactly
 *   full_name/avatar_url/updated_at on their own row); bio +
 *   notification preferences live in `user_preferences` (migration
 *   009, own-row RLS). Password changes go through
 *   supabase.auth.updateUser — the only real path.
 * - Demo backend: the labelled demo store (localStorage). The demo
 *   persona has no real account, so password changes are refused with
 *   an honest explanation instead of a fake success.
 */

import { createClient } from "@/lib/supabase/client";
import { getDataMode, type DataMode } from "./mode";
import { getDemoStorage } from "./demo-store";
import { DEMO_USER_ID } from "./workspace";
import {
  normalizeStoredPrefs,
  validateProfilePatch,
  type StoredUserPrefs,
  type UserPreferences,
} from "@/lib/user-settings/core";

export interface CurrentIdentity {
  id: string;
  email: string;
  full_name: string | null;
}

export interface UserSettingsData {
  identity: CurrentIdentity;
  bio: string;
  preferences: UserPreferences;
}

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; error: string };

export interface UserSettingsRepository {
  readonly mode: DataMode;
  getSettings(): Promise<UserSettingsData>;
  updateProfile(patch: { full_name?: string; bio?: string }): Promise<UserSettingsData>;
  updatePreferences(prefs: UserPreferences): Promise<UserSettingsData>;
  changePassword(newPassword: string): Promise<PasswordChangeResult>;
}

// ── Demo backend ────────────────────────────────────────────────────────────

const DEMO_SETTINGS_KEY = "nxtsend_demo_user_settings_v1";

const DEMO_SEED: StoredUserPrefs & { full_name: string } = {
  full_name: "Alex Vance",
  bio: "Head of Growth. Building multichannel outreach machines.",
  notify_replies: true,
  notify_connections: true,
  daily_digest: false,
  bounce_alerts: true,
};

interface DemoSettingsRecord extends StoredUserPrefs {
  full_name: string;
}

function loadDemoRecord(): DemoSettingsRecord {
  try {
    const raw = getDemoStorage().getItem(DEMO_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        ...normalizeStoredPrefs(parsed),
        full_name:
          typeof parsed.full_name === "string" && parsed.full_name.trim()
            ? (parsed.full_name as string)
            : DEMO_SEED.full_name,
      };
    }
  } catch {
    // corrupted payload → reseed below
  }
  const seeded = { ...DEMO_SEED };
  saveDemoRecord(seeded);
  return seeded;
}

function saveDemoRecord(record: DemoSettingsRecord): void {
  try {
    getDemoStorage().setItem(DEMO_SETTINGS_KEY, JSON.stringify(record));
  } catch {
    // best-effort in demo mode (see demo-store)
  }
}

function demoData(record: DemoSettingsRecord): UserSettingsData {
  const { full_name, bio, ...prefs } = record;
  return {
    identity: { id: DEMO_USER_ID, email: "alex@nxtsend.com", full_name },
    bio,
    preferences: prefs,
  };
}

class DemoUserSettingsRepository implements UserSettingsRepository {
  readonly mode: DataMode = "demo";

  async getSettings(): Promise<UserSettingsData> {
    return demoData(loadDemoRecord());
  }

  async updateProfile(patch: { full_name?: string; bio?: string }): Promise<UserSettingsData> {
    const validated = validateProfilePatch(patch);
    if (!validated.ok) throw new Error(validated.error);
    const record = loadDemoRecord();
    if (validated.value.full_name !== undefined) record.full_name = validated.value.full_name;
    if (validated.value.bio !== undefined) record.bio = validated.value.bio;
    saveDemoRecord(record);
    return demoData(record);
  }

  async updatePreferences(prefs: UserPreferences): Promise<UserSettingsData> {
    const record = loadDemoRecord();
    const normalized = normalizeStoredPrefs({ ...prefs, bio: record.bio });
    Object.assign(record, normalized);
    saveDemoRecord(record);
    return demoData(record);
  }

  async changePassword(): Promise<PasswordChangeResult> {
    return {
      ok: false,
      error:
        "Password changes are unavailable in Demo Mode — the demo persona has no real account. Once Supabase is connected, this form updates your password through Supabase Auth.",
    };
  }
}

// ── Supabase backend ────────────────────────────────────────────────────────

class SupabaseUserSettingsRepository implements UserSettingsRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    return supabase;
  }

  private async identity(): Promise<CurrentIdentity> {
    const supabase = this.client();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    return {
      id: user.id,
      email: (profile?.email as string | undefined) ?? user.email ?? "",
      full_name: (profile?.full_name as string | null) ?? null,
    };
  }

  private async loadPrefs(userId: string): Promise<StoredUserPrefs> {
    const { data } = await this.client()
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    return normalizeStoredPrefs(data?.preferences);
  }

  private async savePrefs(userId: string, prefs: StoredUserPrefs): Promise<void> {
    const { error } = await this.client()
      .from("user_preferences")
      .upsert(
        { user_id: userId, preferences: prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) throw new Error(`Failed to save preferences: ${error.message}`);
  }

  async getSettings(): Promise<UserSettingsData> {
    const identity = await this.identity();
    const prefs = await this.loadPrefs(identity.id);
    const { bio, ...rest } = prefs;
    return { identity, bio, preferences: rest };
  }

  async updateProfile(patch: { full_name?: string; bio?: string }): Promise<UserSettingsData> {
    const validated = validateProfilePatch(patch);
    if (!validated.ok) throw new Error(validated.error);
    const identity = await this.identity();
    if (validated.value.full_name !== undefined) {
      const { error } = await this.client()
        .from("profiles")
        .update({ full_name: validated.value.full_name, updated_at: new Date().toISOString() })
        .eq("id", identity.id);
      if (error) throw new Error(`Failed to save profile: ${error.message}`);
    }
    if (validated.value.bio !== undefined) {
      const prefs = await this.loadPrefs(identity.id);
      await this.savePrefs(identity.id, { ...prefs, bio: validated.value.bio });
    }
    return this.getSettings();
  }

  async updatePreferences(prefs: UserPreferences): Promise<UserSettingsData> {
    const identity = await this.identity();
    const current = await this.loadPrefs(identity.id);
    const normalized = normalizeStoredPrefs({ ...prefs, bio: current.bio });
    await this.savePrefs(identity.id, normalized);
    return this.getSettings();
  }

  async changePassword(newPassword: string): Promise<PasswordChangeResult> {
    const { error } = await this.client().auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

let cached: UserSettingsRepository | null = null;

export function getUserSettingsRepository(): UserSettingsRepository {
  if (!cached) {
    cached =
      getDataMode() === "supabase"
        ? new SupabaseUserSettingsRepository()
        : new DemoUserSettingsRepository();
  }
  return cached;
}

export function createUserSettingsRepository(
  mode: DataMode = getDataMode()
): UserSettingsRepository {
  return mode === "supabase"
    ? new SupabaseUserSettingsRepository()
    : new DemoUserSettingsRepository();
}
