/**
 * Workspace safety settings repository — the auto-pilot safe-sending
 * limits (migration 022, `workspace_safety_settings`).
 *
 * One row per workspace (workspace_id is the primary key): the daily
 * connection cap, the working-hours window, the working days (ISO
 * weekday numbers, 1 = Monday … 7 = Sunday) and the ramp-up toggle.
 * A workspace with no row reads exactly as the defaults below — the
 * executor treats "no row" and "defaults" identically, so this
 * migration changes no behaviour on its own.
 *
 * - Supabase backend: the table, scoped by workspace_id (RLS:
 *   workspace members). `get` returns the defaults when no row
 *   exists; `save` upserts.
 * - Demo backend: the labelled demo store (localStorage) under its
 *   own key, `nxtsend_demo_safety_settings_v1`.
 *
 * Honesty: these limits are settings the executor enforces when a
 * LinkedIn provider exists. They never claim a LinkedIn send — with
 * no provider connected, LinkedIn steps are still recorded `skipped`.
 */

import { createClient } from "@/lib/supabase/client";
import { getDataMode, type DataMode } from "./mode";
import { getDemoStorage } from "./demo-store";

export interface SafetySettings {
  workspace_id: string;
  /** Max LinkedIn connection requests per workspace per UTC day. */
  daily_connection_cap: number;
  /** Working-hours window start, "HH:MM" (UTC — the codebase has no workspace-timezone concept). */
  working_hours_start: string;
  /** Working-hours window end, "HH:MM". End <= start means an empty window (never within hours), not an overnight window. */
  working_hours_end: string;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  working_days: number[];
  /** Workspace-level master switch for warm-up ramp programs. */
  ramp_up_enabled: boolean;
  updated_at?: string;
}

/** The defaults a workspace with no row reads as (migration 022). */
export const DEFAULT_SAFETY_SETTINGS = {
  daily_connection_cap: 15,
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  working_days: [1, 2, 3, 4, 5],
  ramp_up_enabled: true,
} as const;

export const DEMO_SAFETY_SETTINGS_KEY = "nxtsend_demo_safety_settings_v1";

export function defaultSafetySettings(workspaceId: string): SafetySettings {
  return {
    workspace_id: workspaceId,
    daily_connection_cap: DEFAULT_SAFETY_SETTINGS.daily_connection_cap,
    working_hours_start: DEFAULT_SAFETY_SETTINGS.working_hours_start,
    working_hours_end: DEFAULT_SAFETY_SETTINGS.working_hours_end,
    working_days: [...DEFAULT_SAFETY_SETTINGS.working_days],
    ramp_up_enabled: DEFAULT_SAFETY_SETTINGS.ramp_up_enabled,
  };
}

function clampCap(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates a "HH:MM" time; null when unusable. A stored TIME column
 * may come back as "09:00:00" — the seconds are trimmed first.
 */
function parseTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 5);
  return TIME_RE.test(trimmed) ? trimmed : null;
}

function parseWorkingDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const days = Array.from(
    new Set(
      value.filter(
        (d): d is number =>
          typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7
      )
    )
  ).sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

/**
 * Tolerant reader over a stored row / demo record: any missing or
 * invalid field falls back to its default, never to a crash. The
 * workspace_id always comes from the caller, never from the row.
 */
export function normalizeSafetySettings(
  value: unknown,
  workspaceId: string
): SafetySettings {
  const defaults = defaultSafetySettings(workspaceId);
  if (!value || typeof value !== "object") return defaults;
  const rec = value as Record<string, unknown>;
  const cap = clampCap(rec.daily_connection_cap);
  const start = parseTime(rec.working_hours_start);
  const end = parseTime(rec.working_hours_end);
  const days = parseWorkingDays(rec.working_days);
  return {
    workspace_id: workspaceId,
    daily_connection_cap: cap ?? defaults.daily_connection_cap,
    working_hours_start: start ?? defaults.working_hours_start,
    working_hours_end: end ?? defaults.working_hours_end,
    working_days: days ?? defaults.working_days,
    ramp_up_enabled:
      typeof rec.ramp_up_enabled === "boolean"
        ? rec.ramp_up_enabled
        : defaults.ramp_up_enabled,
    ...(typeof rec.updated_at === "string" && rec.updated_at
      ? { updated_at: rec.updated_at }
      : {}),
  };
}

export interface SafetySettingsPatch {
  daily_connection_cap?: number;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: number[];
  ramp_up_enabled?: boolean;
}

export interface SafetySettingsRepository {
  readonly mode: DataMode;
  /** The stored settings, or the defaults when no row exists yet. */
  get(workspaceId: string): Promise<SafetySettings>;
  /** Merges the patch over the current settings and upserts the row. */
  save(workspaceId: string, patch: SafetySettingsPatch): Promise<SafetySettings>;
}

// ── Demo backend ────────────────────────────────────────────────────────────

class DemoSafetySettingsRepository implements SafetySettingsRepository {
  readonly mode: DataMode = "demo";

  private load(workspaceId: string): SafetySettings {
    try {
      const raw = getDemoStorage().getItem(DEMO_SAFETY_SETTINGS_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as Record<string, unknown>).workspace_id === workspaceId
        ) {
          return normalizeSafetySettings(parsed, workspaceId);
        }
      }
    } catch {
      // corrupted payload → defaults below
    }
    return defaultSafetySettings(workspaceId);
  }

  private store(settings: SafetySettings): void {
    try {
      getDemoStorage().setItem(
        DEMO_SAFETY_SETTINGS_KEY,
        JSON.stringify(settings)
      );
    } catch {
      // best-effort in demo mode (see demo-store)
    }
  }

  async get(workspaceId: string): Promise<SafetySettings> {
    return this.load(workspaceId);
  }

  async save(
    workspaceId: string,
    patch: SafetySettingsPatch
  ): Promise<SafetySettings> {
    const merged = normalizeSafetySettings(
      { ...this.load(workspaceId), ...patch, workspace_id: workspaceId },
      workspaceId
    );
    merged.updated_at = new Date().toISOString();
    this.store(merged);
    return merged;
  }
}

// ── Supabase backend ────────────────────────────────────────────────────────

class SupabaseSafetySettingsRepository implements SafetySettingsRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    return supabase;
  }

  async get(workspaceId: string): Promise<SafetySettings> {
    const { data, error } = await this.client()
      .from("workspace_safety_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load safety settings: ${error.message}`);
    if (!data) return defaultSafetySettings(workspaceId);
    return normalizeSafetySettings(data, workspaceId);
  }

  async save(
    workspaceId: string,
    patch: SafetySettingsPatch
  ): Promise<SafetySettings> {
    const current = await this.get(workspaceId);
    const merged = normalizeSafetySettings(
      { ...current, ...patch, workspace_id: workspaceId },
      workspaceId
    );
    const row = {
      workspace_id: workspaceId,
      daily_connection_cap: merged.daily_connection_cap,
      working_hours_start: merged.working_hours_start,
      working_hours_end: merged.working_hours_end,
      working_days: merged.working_days,
      ramp_up_enabled: merged.ramp_up_enabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.client()
      .from("workspace_safety_settings")
      .upsert(row, { onConflict: "workspace_id" });
    if (error) throw new Error(`Failed to save safety settings: ${error.message}`);
    return { ...merged, updated_at: row.updated_at };
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

let cached: SafetySettingsRepository | null = null;

export function getSafetySettingsRepository(): SafetySettingsRepository {
  if (!cached) {
    cached =
      getDataMode() === "supabase"
        ? new SupabaseSafetySettingsRepository()
        : new DemoSafetySettingsRepository();
  }
  return cached;
}

export function createSafetySettingsRepository(
  mode: DataMode = getDataMode()
): SafetySettingsRepository {
  return mode === "supabase"
    ? new SupabaseSafetySettingsRepository()
    : new DemoSafetySettingsRepository();
}
