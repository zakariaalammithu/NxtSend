/**
 * Safe-sending limits — pure cap / working-window logic for the
 * executor gate (src/lib/executor/core.ts).
 *
 * Pure, no DB, no clock of its own. The executor resolves the
 * workspace settings (stored row, or the defaults when there is no
 * row) and today's counted usage, then asks here whether a LinkedIn
 * step may proceed.
 *
 * Time discipline (same as the warm-up engine): UTC throughout — the
 * codebase has no workspace-timezone concept. The working window is
 * [start, end): the start minute is inside, the end minute is
 * outside. An end <= start is an EMPTY window (never within hours),
 * not an overnight window — an owner who wants overnight sending
 * must widen the window explicitly, and a mis-typed end can never
 * silently open the whole night.
 *
 * Honesty: this gate only DEFERS. It never sends anything and never
 * changes the LinkedIn-skipped behaviour — a step the gate allows is
 * still recorded `skipped` while no authorized LinkedIn provider is
 * integrated.
 */

import type { SafetySettings } from "@/lib/data/safety-settings";

/** The settings fields the gate reads (structural — the repository type satisfies this). */
export interface SafetyWindowSettings {
  daily_connection_cap: number;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  ramp_up_enabled: boolean;
}

export type { SafetySettings };

/**
 * The cap that actually binds for connection requests: the LOWER of
 * the workspace cap and the sender account's own daily limit for
 * connection requests. The account cap is null when no account limit
 * is known (no sender account / no warm-up state) — the workspace
 * cap then binds on its own. The safe direction always wins.
 */
export function effectiveConnectionCap(
  workspaceCap: number,
  accountCap: number | null | undefined
): number {
  const ws = Number.isFinite(workspaceCap)
    ? Math.max(0, Math.floor(workspaceCap))
    : 0;
  if (accountCap === null || accountCap === undefined) return ws;
  const acc = Number.isFinite(accountCap)
    ? Math.max(0, Math.floor(accountCap))
    : ws;
  return Math.min(ws, acc);
}

/** "HH:MM" → minutes after midnight, or null when unusable. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** JS getUTCDay (0 = Sunday) → ISO weekday number (1 = Monday … 7 = Sunday). */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * True when `now` falls inside the workspace working window: the
 * ISO weekday is one of the working days AND the UTC time is within
 * [start, end). False when the window is empty (end <= start), when
 * the day is not a working day, or when either time is unusable
 * (fail-closed: an unusable window defers, it never opens).
 */
export function isWithinWorkingWindow(
  now: Date,
  settings: SafetyWindowSettings
): boolean {
  if (!settings.working_days.includes(isoWeekday(now))) return false;
  const start = parseTimeToMinutes(settings.working_hours_start);
  const end = parseTimeToMinutes(settings.working_hours_end);
  if (start === null || end === null) return false;
  if (end <= start) return false; // empty window, never overnight
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= start && minutes < end;
}

/** ISO weekday number (1 = Monday … 7 = Sunday) → short label. */
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Human-readable window, e.g. "09:00–18:00, Mon, Tue, Wed, Thu, Fri". */
export function describeWorkingWindow(settings: SafetyWindowSettings): string {
  const days = settings.working_days
    .map((d) => WEEKDAY_LABELS[d - 1] ?? String(d))
    .join(", ");
  return `${settings.working_hours_start}–${settings.working_hours_end}, ${days}`;
}

export type SafetyGateReason = "ok" | "outside_working_hours" | "over_daily_cap";

export interface SafetyGateDecision {
  allowed: boolean;
  reason: SafetyGateReason;
}

/**
 * The gate decision for one LinkedIn step.
 *
 * - `isConnectionRequest`: only connection requests count against
 *   the daily connection cap; other LinkedIn steps (messages, views,
 *   likes) are governed by the working window only.
 * - `connectionsUsedToday`: the workspace's counted connection
 *   requests so far today (UTC day), resolved once per scan by the
 *   executor and incremented locally per dispatch.
 * - `effectiveCap`: the already-resolved min(workspace cap, account
 *   cap) from effectiveConnectionCap.
 */
export function evaluateSafetyGate(
  now: Date,
  settings: SafetyWindowSettings,
  opts: {
    isConnectionRequest: boolean;
    connectionsUsedToday: number;
    effectiveCap: number;
  }
): SafetyGateDecision {
  if (!isWithinWorkingWindow(now, settings)) {
    return { allowed: false, reason: "outside_working_hours" };
  }
  if (
    opts.isConnectionRequest &&
    opts.connectionsUsedToday >= opts.effectiveCap
  ) {
    return { allowed: false, reason: "over_daily_cap" };
  }
  return { allowed: true, reason: "ok" };
}
