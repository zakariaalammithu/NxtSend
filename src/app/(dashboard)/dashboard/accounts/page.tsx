"use client";

/**
 * Connected Accounts — the workspace's sending identities
 * (migration 011 `connected_accounts`).
 *
 * One card per account: avatar, name, handle/email, status, the
 * warm-up toggle, the sender identity that fills the {my_*}
 * template variables, and (for LinkedIn accounts) the daily-limits
 * editor. Everything persists through the accounts repository.
 *
 * "Add account" is deliberately NOT a connect form: LinkedIn
 * accounts connect through an approved LinkedIn integration and
 * email accounts through the email integration, so both actions
 * route to the Integration Center. In Demo Mode the two seeded
 * accounts are simulated records and are labelled as such.
 */

import * as React from "react";
import Link from "next/link";
import {
  Linkedin,
  Mail,
  Plus,
  Trash2,
  ChevronDown,
  Info,
  User,
  HeartPulse,
  RefreshCcw,
} from "lucide-react";
import type {
  ConnectedAccount,
  WarmupHistoryEntry,
  WarmupLimits,
  WarmupSchedule,
} from "@/types";
import {
  accountHealthActionHref,
  accountHealthView,
  WARMUP_PRESETS,
  WARMUP_PRESET_NOTE,
  cloneSchedule,
  currentPhase,
  deriveStatus,
  effectiveCaps,
  phaseDay,
  scheduleTotalDays,
  warmupProgress,
  type WarmupPresetKey,
} from "@/lib/linkedin";
import {
  getAccountsRepository,
  getCampaignsRepository,
  resolveWorkspaceId,
  accountLimits,
  editWarmupSchedule,
  markWarmupReady,
  pauseWarmup,
  recordWarmupGraduation,
  restartWarmup,
  resumeWarmup,
  setWarmupOverride,
  startWarmup,
  warmupStateOf,
} from "@/lib/data";
import { WARMUP_LIMIT_ROWS } from "@/lib/data/audience-source";
import { Avatar } from "@/components/ui/Avatar";

function StatusChip({ account }: { account: ConnectedAccount }) {
  if (account.status === "demo") {
    return <span className="demo-badge">Demo account</span>;
  }
  if (account.status === "connected") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-11 font-medium text-emerald-300">
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-black-600 bg-black-800 px-2 py-0.5 text-11 font-medium text-black-300 capitalize">
      {account.status}
    </span>
  );
}

const HEALTH_TONE_CLS: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  muted: "border-black-600 bg-black-800 text-black-300",
};

/**
 * Authorization health (migration 013): the account RECORD's last
 * known state at its provider — deliberately separate from whether
 * a provider integration is configured at all (for LinkedIn it is
 * not; see the provider note in the LinkedIn section below). A
 * Reconnect/Review action routes to the channel's integration page:
 * reconnecting happens through the provider there — this page never
 * renders a password or cookie form.
 */
function HealthBlock({ account }: { account: ConnectedAccount }) {
  const health = accountHealthView(account);
  return (
    <div className="rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="flex items-center gap-2 text-13 font-semibold text-white">
          <HeartPulse className="h-4 w-4 text-black-400" />
          Connection health
        </h4>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-11 font-medium ${HEALTH_TONE_CLS[health.tone]}`}
          data-testid={`account-health-${account.id}`}
        >
          {health.label}
        </span>
        {health.action !== "none" && (
          <Link
            href={accountHealthActionHref(account.channel, account.provider)}
            className="inline-flex items-center gap-1 text-12 font-medium text-purple-300 hover:text-purple-200"
            data-testid={`account-health-action-${account.id}`}
          >
            <RefreshCcw className="h-3 w-3" />
            {health.actionLabel}
          </Link>
        )}
      </div>
      <p className="text-12 text-black-400">{health.description}</p>
      {account.last_error && account.auth_status !== "error" && (
        <p className="text-12 text-rose-300/80">
          Last provider error: {account.last_error}
        </p>
      )}
      <p className="text-12 text-black-500">
        {account.last_sync_at
          ? `Last synced ${new Date(account.last_sync_at).toLocaleString()}`
          : "Never synced with a provider"}
        {account.provider_account_id
          ? ` · Provider account ${account.provider_account_id}`
          : ""}
      </p>
    </div>
  );
}

const HISTORY_ACTION_LABELS: Record<WarmupHistoryEntry["action"], string> = {
  started: "Started",
  paused: "Paused",
  resumed: "Resumed",
  restarted: "Restarted",
  schedule_edited: "Schedule edited",
  override_set: "Override changed",
  graduated: "Graduated",
  marked_ready: "Marked ready",
};

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Start of the current UTC day — the same window the executor's
 *  warm-up gate counts in (dayPeriodStartIso in the executor core). */
function utcDayStartIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

const inputCls =
  "w-full rounded-lg border border-black-600 bg-black-800 px-2 py-1.5 text-13 text-white";
const btnCls =
  "rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-3 py-1.5 text-12.5 font-medium text-white transition-colors disabled:opacity-50";
const btnPrimaryCls =
  "rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-12.5 font-semibold text-white transition-colors disabled:opacity-50";

/**
 * Phase editor: days + the six caps per phase, add/remove phases.
 * Used for a custom start and for editing a running program (any
 * save flips the program's preset to "custom").
 */
function ScheduleEditor({
  accountId,
  initial,
  saveLabel,
  busy,
  onSave,
  onCancel,
}: {
  accountId: string;
  initial: WarmupSchedule;
  saveLabel: string;
  busy: boolean;
  onSave: (schedule: WarmupSchedule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState<WarmupSchedule>(() =>
    cloneSchedule(initial)
  );
  const setPhaseDays = (idx: number, days: number) =>
    setDraft((prev) => ({
      phases: prev.phases.map((p, i) =>
        i === idx ? { ...p, days: Math.max(1, Math.floor(days) || 1) } : p
      ),
    }));
  const setPhaseCap = (idx: number, key: keyof WarmupLimits, value: number) =>
    setDraft((prev) => ({
      phases: prev.phases.map((p, i) =>
        i === idx
          ? {
              ...p,
              caps: {
                ...p.caps,
                [key]: Math.max(0, Math.floor(value) || 0),
              },
            }
          : p
      ),
    }));
  return (
    <div
      className="space-y-3 rounded-xl border border-black-700/80 bg-black-900/40 p-3"
      data-testid={`warmup-editor-${accountId}`}
    >
      {draft.phases.map((phase, idx) => (
        <div
          key={idx}
          className="space-y-2 border-b border-black-800 pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-12.5 font-semibold text-white">
              Phase {idx + 1}
            </span>
            <label className="flex items-center gap-1.5 text-12 text-black-400">
              days
              <input
                type="number"
                min={1}
                value={phase.days}
                onChange={(e) => setPhaseDays(idx, Number(e.target.value))}
                className={`${inputCls} w-16`}
                data-testid={`warmup-phase-days-${idx}-${accountId}`}
              />
            </label>
            {draft.phases.length > 1 && (
              <button
                type="button"
                className="text-12 text-rose-300 hover:text-rose-200"
                onClick={() =>
                  setDraft((prev) => ({
                    phases: prev.phases.filter((_, i) => i !== idx),
                  }))
                }
              >
                Remove phase
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {WARMUP_LIMIT_ROWS.map((row) => (
              <label key={row.key} className="block">
                <span className="block text-11 text-black-400 mb-0.5">
                  {row.label}
                </span>
                <input
                  type="number"
                  min={0}
                  value={phase.caps[row.key]}
                  onChange={(e) =>
                    setPhaseCap(idx, row.key, Number(e.target.value))
                  }
                  className={inputCls}
                  data-testid={`warmup-phase-cap-${idx}-${row.key}-${accountId}`}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className={btnCls}
          disabled={busy}
          onClick={() =>
            setDraft((prev) => ({
              phases: [
                ...prev.phases,
                {
                  days: 5,
                  caps: { ...prev.phases[prev.phases.length - 1].caps },
                },
              ],
            }))
          }
          data-testid={`warmup-phase-add-${accountId}`}
        >
          Add phase
        </button>
        <span className="text-12 text-black-500">
          {scheduleTotalDays(draft)} days total
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={btnCls}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimaryCls}
          disabled={busy}
          onClick={() => onSave(draft)}
          data-testid={`warmup-schedule-save-${accountId}`}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The warm-up PROGRAM panel (migration 020) for one LinkedIn account:
 * lifecycle status, phase timeline, today's usage vs the effective
 * caps (from the SAME counter the executor gate uses), the
 * transparent cap math, every control action, and the control
 * history. All actions persist through the accounts repository
 * helpers, so Demo Mode and live mode behave identically.
 */
function WarmupPanel({
  account,
  workspaceId,
  onAccountChange,
  onUpdate,
}: {
  account: ConnectedAccount;
  workspaceId: string;
  onAccountChange: (updated: ConnectedAccount) => void;
  onUpdate: (id: string, patch: Partial<ConnectedAccount>) => Promise<void>;
}) {
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [presetChoice, setPresetChoice] =
    React.useState<WarmupPresetKey>("conservative");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [usageBump, setUsageBump] = React.useState(0);
  const [usage, setUsage] = React.useState<Record<
    keyof WarmupLimits,
    number
  > | null>(null);
  const [overrideDraft, setOverrideDraft] = React.useState<
    Record<string, string>
  >({});
  const graduationRef = React.useRef(false);

  const now = new Date();
  const state = warmupStateOf(account);
  const status = deriveStatus(state, now);
  const day = phaseDay(state, now);
  const totalDays = scheduleTotalDays(state.schedule);
  const position = currentPhase(state, now);
  const caps = effectiveCaps(state, now);
  const progress = usage ? warmupProgress(state, usage, now) : null;

  // Today's usage from the same counter the executor gate uses.
  React.useEffect(() => {
    let cancelled = false;
    accountsRepo
      .countLinkedInActionsToday(
        workspaceId,
        account.id,
        utcDayStartIso(new Date())
      )
      .then((counts) => {
        if (!cancelled) setUsage(counts);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsRepo, workspaceId, account.id, usageBump]);

  // Lazy graduation, panel side: when the derived status is
  // "graduated" but the stored one is not, persist the transition so
  // the record catches up (the executor gate does the same).
  React.useEffect(() => {
    if (graduationRef.current) return;
    if (status === "graduated" && account.warmup_status !== "graduated") {
      graduationRef.current = true;
      recordWarmupGraduation(accountsRepo, workspaceId, account.id)
        .then((updated) => {
          if (updated) onAccountChange(updated);
        })
        .catch(() => {
          /* derived status still renders correctly */
        });
    }
  }, [status, account.warmup_status, account.id, accountsRepo, workspaceId, onAccountChange]);

  const run = async (
    fn: () => Promise<ConnectedAccount | null>,
    noteText: string,
    alsoEnable = false
  ) => {
    setBusy(true);
    setNote(null);
    try {
      const updated = await fn();
      if (updated) {
        onAccountChange(updated);
        if (alsoEnable && !updated.warmup_enabled) {
          await onUpdate(updated.id, { warmup_enabled: true });
        }
      }
      setEditorOpen(false);
      setUsageBump((b) => b + 1);
      setNote(noteText);
      window.setTimeout(() => setNote(null), 3000);
    } catch {
      setNote("That didn't save — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const chipCls =
    status === "warming"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : status === "paused"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : status === "graduated"
          ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
          : "border-black-600 bg-black-800 text-black-300";
  const chipText =
    status === "warming"
      ? `Warming · Day ${day} of ${totalDays}`
      : status === "paused"
        ? `Paused · Day ${day} of ${totalDays}`
        : status === "graduated"
          ? "Ready"
          : "Not started";

  // The transparent math: wherever something other than the phase
  // cap alone decides today's cap, say so in one line.
  const mathLines: string[] = [];
  if ((status === "warming" || status === "paused") && position) {
    for (const row of WARMUP_LIMIT_ROWS) {
      const phaseCap = position.phase.caps[row.key];
      const pinned = state.overrides?.[row.key];
      const daily = state.dailyLimits[row.key];
      if (typeof pinned === "number") {
        mathLines.push(
          `${row.label}: pinned at ${pinned} · daily limit ${daily} → effective ${caps[row.key]}`
        );
      } else if (phaseCap > daily) {
        mathLines.push(
          `${row.label}: phase allows ${phaseCap} · your daily limit is ${daily} → effective ${daily}`
        );
      }
    }
  }

  const history = [...state.history].slice(-5).reverse();

  return (
    <div
      className="space-y-4 rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3"
      data-testid={`warmup-panel-${account.id}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="text-13 font-semibold text-white">Warm-up program</h4>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-11 font-medium ${chipCls}`}
          data-testid={`warmup-status-${account.id}`}
        >
          {chipText}
        </span>
        {state.preset && status !== "not_started" && (
          <span className="text-12 text-black-500 capitalize">
            {state.preset} program
          </span>
        )}
      </div>

      {!account.warmup_enabled && status !== "not_started" && (
        <p className="text-12 text-amber-200/90">
          Warm-up mode is switched off above, so no caps are enforced
          right now — the program and its day count are kept as shown.
        </p>
      )}

      {status === "not_started" ? (
        <div className="space-y-3">
          <p className="text-12.5 text-black-300 leading-relaxed">
            A warm-up program ramps this account&apos;s daily LinkedIn
            actions over a few weeks: each phase caps how many actions
            go out per day, and steps beyond today&apos;s cap stay due
            instead of being dropped. You control the schedule and the
            limits throughout.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              Object.values(WARMUP_PRESETS) as Array<
                (typeof WARMUP_PRESETS)[WarmupPresetKey]
              >
            ).map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPresetChoice(preset.key)}
                aria-pressed={presetChoice === preset.key}
                data-testid={`warmup-preset-${preset.key}-${account.id}`}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  presetChoice === preset.key
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-black-600 bg-black-800/60 hover:border-black-500"
                }`}
              >
                <span className="block text-13 font-semibold text-white">
                  {preset.label} · {scheduleTotalDays(preset.schedule)} days
                </span>
                <span className="block text-12 text-black-400 mt-0.5 leading-relaxed">
                  {preset.blurb}
                </span>
                <span className="block text-12 text-black-300 mt-1">
                  Connections{" "}
                  {preset.schedule.phases
                    .map((p) => p.caps.connection_requests)
                    .join(" → ")}
                  /day
                </span>
              </button>
            ))}
          </div>
          <p className="text-12 text-black-500">{WARMUP_PRESET_NOTE}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={btnPrimaryCls}
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    startWarmup(accountsRepo, workspaceId, account.id, presetChoice, {
                      by: null,
                    }),
                  "Warm-up program started.",
                  true
                )
              }
              data-testid={`warmup-start-${account.id}`}
            >
              Start {WARMUP_PRESETS[presetChoice].label}
            </button>
            <button
              type="button"
              className={btnCls}
              disabled={busy}
              onClick={() => setEditorOpen((v) => !v)}
            >
              Custom schedule instead
            </button>
          </div>
          {editorOpen && (
            <ScheduleEditor
              accountId={account.id}
              initial={WARMUP_PRESETS.conservative.schedule}
              saveLabel="Start with this schedule"
              busy={busy}
              onCancel={() => setEditorOpen(false)}
              onSave={(schedule) =>
                void run(
                  () =>
                    startWarmup(accountsRepo, workspaceId, account.id, schedule, {
                      by: null,
                    }),
                  "Warm-up program started with your custom schedule.",
                  true
                )
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Phase timeline */}
          {state.schedule && (
            <div
              className="flex gap-1.5"
              data-testid={`warmup-timeline-${account.id}`}
            >
              {state.schedule.phases.map((phase, idx) => {
                const isCurrent = position?.index === idx;
                const isDone =
                  status === "graduated" ||
                  (position !== null && idx < position.index);
                const startDay =
                  state.schedule!.phases
                    .slice(0, idx)
                    .reduce((s, p) => s + p.days, 0) + 1;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-lg border px-2 py-1.5 ${
                      isCurrent
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : isDone
                          ? "border-black-600 bg-black-700/40"
                          : "border-black-700 bg-black-800/40"
                    }`}
                  >
                    <p className="text-11 font-semibold text-white">
                      Phase {idx + 1}
                      {isCurrent ? " · now" : isDone ? " · done" : ""}
                    </p>
                    <p className="text-11 text-black-400">
                      Days {startDay}–{startDay + phase.days - 1} ·{" "}
                      {phase.caps.connection_requests} conn/day
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Today vs effective caps — the gate's own counter */}
          <div data-testid={`warmup-today-${account.id}`}>
            <p className="text-12 font-medium text-black-300 mb-2">
              Today (UTC) — sent vs effective cap
            </p>
            <div className="space-y-2">
              {WARMUP_LIMIT_ROWS.map((row) => {
                const p = progress?.[row.key];
                const unenforced = row.key === "find_email";
                return (
                  <div
                    key={row.key}
                    data-testid={`warmup-usage-${row.key}-${account.id}`}
                  >
                    <div className="flex items-center justify-between text-12">
                      <span className="text-black-300">{row.label}</span>
                      <span className="text-black-400">
                        {unenforced
                          ? `— / ${caps[row.key]}`
                          : `${p?.used ?? "…"} / ${caps[row.key]}`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-black-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          unenforced
                            ? "bg-black-600"
                            : (p?.pct ?? 0) >= 100
                              ? "bg-rose-400"
                              : "bg-emerald-400"
                        }`}
                        style={{
                          width: unenforced ? "0%" : `${p?.pct ?? 0}%`,
                        }}
                      />
                    </div>
                    {unenforced && (
                      <p className="text-11 text-black-500 mt-0.5">
                        Stored limit only — no sequence step uses Find
                        email, so nothing enforces this cap yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {mathLines.length > 0 && (
              <div
                className="mt-2 space-y-0.5"
                data-testid={`warmup-math-${account.id}`}
              >
                {mathLines.map((line) => (
                  <p key={line} className="text-11.5 text-black-400">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {status === "warming" && (
              <button
                type="button"
                className={btnCls}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => pauseWarmup(accountsRepo, workspaceId, account.id),
                    "Warm-up paused — its clock is frozen."
                  )
                }
                data-testid={`warmup-pause-${account.id}`}
              >
                Pause
              </button>
            )}
            {status === "paused" && (
              <button
                type="button"
                className={btnPrimaryCls}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => resumeWarmup(accountsRepo, workspaceId, account.id),
                    "Warm-up resumed."
                  )
                }
                data-testid={`warmup-resume-${account.id}`}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              className={btnCls}
              disabled={busy}
              onClick={() => setEditorOpen((v) => !v)}
              data-testid={`warmup-edit-${account.id}`}
            >
              Edit schedule
            </button>
            <button
              type="button"
              className={btnCls}
              disabled={busy}
              onClick={() =>
                void run(
                  () => restartWarmup(accountsRepo, workspaceId, account.id),
                  "Warm-up restarted at Day 1 — schedule kept."
                )
              }
              data-testid={`warmup-restart-${account.id}`}
            >
              Restart
            </button>
            {status !== "graduated" && (
              <button
                type="button"
                className={btnCls}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => markWarmupReady(accountsRepo, workspaceId, account.id),
                    "Marked ready — warm-up caps no longer apply."
                  )
                }
                data-testid={`warmup-ready-${account.id}`}
              >
                Mark ready
              </button>
            )}
          </div>

          {editorOpen && state.schedule && (
            <ScheduleEditor
              accountId={account.id}
              initial={state.schedule}
              saveLabel="Save schedule"
              busy={busy}
              onCancel={() => setEditorOpen(false)}
              onSave={(schedule) =>
                void run(
                  () =>
                    editWarmupSchedule(
                      accountsRepo,
                      workspaceId,
                      account.id,
                      schedule
                    ),
                  "Schedule saved — this program is now custom."
                )
              }
            />
          )}

          {/* Per-action overrides */}
          {(status === "warming" || status === "paused") && (
            <div className="space-y-2">
              <p className="text-12 font-medium text-black-300">
                Per-action overrides
              </p>
              <p className="text-12 text-black-500">
                Pin an action to a fixed daily cap, replacing its phase
                cap (your daily limit still applies on top).
              </p>
              {WARMUP_LIMIT_ROWS.map((row) => {
                const pinned = state.overrides?.[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <span className="w-36 text-12 text-black-300">
                      {row.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={
                        overrideDraft[row.key] ??
                        (typeof pinned === "number" ? String(pinned) : "")
                      }
                      placeholder={
                        position
                          ? `Phase cap ${position.phase.caps[row.key]}`
                          : "Phase cap"
                      }
                      onChange={(e) =>
                        setOverrideDraft((prev) => ({
                          ...prev,
                          [row.key]: e.target.value,
                        }))
                      }
                      className={`${inputCls} w-24`}
                      data-testid={`warmup-override-input-${row.key}-${account.id}`}
                    />
                    <button
                      type="button"
                      className={btnCls}
                      disabled={busy}
                      onClick={() => {
                        const raw = overrideDraft[row.key];
                        const value =
                          raw === undefined || raw === ""
                            ? null
                            : Math.max(0, Math.floor(Number(raw) || 0));
                        void run(
                          () =>
                            setWarmupOverride(
                              accountsRepo,
                              workspaceId,
                              account.id,
                              row.key,
                              value
                            ),
                          value === null
                            ? `${row.label} pin cleared.`
                            : `${row.label} pinned at ${value}/day.`
                        );
                      }}
                      data-testid={`warmup-override-set-${row.key}-${account.id}`}
                    >
                      Set
                    </button>
                    {typeof pinned === "number" && (
                      <button
                        type="button"
                        className="text-12 text-black-400 hover:text-white"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              setWarmupOverride(
                                accountsRepo,
                                workspaceId,
                                account.id,
                                row.key,
                                null
                              ),
                            `${row.label} pin cleared.`
                          )
                        }
                        data-testid={`warmup-override-clear-${row.key}-${account.id}`}
                      >
                        Clear pin ({pinned}/day)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div data-testid={`warmup-history-${account.id}`}>
              <p className="text-12 font-medium text-black-300 mb-1">
                Recent program actions
              </p>
              <ul className="space-y-0.5">
                {history.map((h, i) => (
                  <li key={i} className="text-12 text-black-400">
                    {HISTORY_ACTION_LABELS[h.action]} ·{" "}
                    {formatHistoryDate(h.at)}
                    {h.detail ? ` — ${h.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {note && (
        <p className="text-12 text-emerald-300" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

function AccountCard({
  account,
  workspaceId,
  onUpdate,
  onAccountChange,
  onDelete,
}: {
  account: ConnectedAccount;
  workspaceId: string | null;
  onUpdate: (id: string, patch: Partial<ConnectedAccount>) => Promise<void>;
  onAccountChange: (updated: ConnectedAccount) => void;
  onDelete: (account: ConnectedAccount) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [limitsOpen, setLimitsOpen] = React.useState(false);
  const [limits, setLimits] = React.useState<WarmupLimits>(() =>
    accountLimits(account)
  );
  const [identity, setIdentity] = React.useState({
    sender_first_name: account.sender_first_name,
    sender_last_name: account.sender_last_name,
    sender_job_title: account.sender_job_title,
    sender_company: account.sender_company,
  });
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const flash = (note: string) => {
    setSavedNote(note);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  const toggleWarmup = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { warmup_enabled: !account.warmup_enabled });
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { daily_limits: limits });
      flash("Daily limits saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveIdentity = async () => {
    setBusy(true);
    try {
      await onUpdate(account.id, { ...identity });
      flash("Sender identity saved.");
    } finally {
      setBusy(false);
    }
  };

  const isLinkedin = account.channel === "linkedin";

  return (
    <div
      className="glass-card p-5 space-y-5"
      data-testid={`account-card-${account.id}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <Avatar
          src={account.avatar_url}
          name={account.display_name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-16 font-semibold text-white">
              {account.display_name}
            </h3>
            <StatusChip account={account} />
          </div>
          <p className="text-13 text-black-400 truncate">
            {account.handle_or_email || "—"}
          </p>
          <p className="text-12 text-black-500">
            {isLinkedin ? "LinkedIn account" : "Email account"} · via{" "}
            {account.provider}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(account)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          aria-label={`Delete account ${account.display_name}`}
          title="Delete account"
          data-testid={`account-delete-${account.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Connection health (migration 013) */}
      <HealthBlock account={account} />

      {/* Warm-up toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3">
        <div>
          <p className="text-13 font-medium text-white">Warm-up mode</p>
          <p className="text-12 text-black-400">
            {account.warmup_enabled
              ? "On — the master switch for this account's warm-up program below."
              : "Off — no warm-up caps are enforced for this account."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={account.warmup_enabled}
          aria-label={`Toggle warm-up for ${account.display_name}`}
          disabled={busy}
          onClick={() => void toggleWarmup()}
          data-testid={`account-warmup-toggle-${account.id}`}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            account.warmup_enabled ? "bg-emerald-500" : "bg-black-600"
          } ${busy ? "opacity-50" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              account.warmup_enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Warm-up program (LinkedIn accounts, migration 020) */}
      {isLinkedin && workspaceId && (
        <WarmupPanel
          account={account}
          workspaceId={workspaceId}
          onAccountChange={onAccountChange}
          onUpdate={onUpdate}
        />
      )}

      {/* Sender identity — feeds {my_first_name} etc. */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-13 font-semibold text-white">
          <User className="h-4 w-4 text-black-400" />
          Sender identity
        </h4>
        <p className="text-12 text-black-400 leading-relaxed">
          Used by the {"{my_first_name}"}, {"{my_last_name}"},{" "}
          {"{my_job_title}"} and {"{my_company_name}"} variables in this
          account&apos;s campaign messages.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              ["sender_first_name", "First name"],
              ["sender_last_name", "Last name"],
              ["sender_job_title", "Job title"],
              ["sender_company", "Company"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-12 font-medium text-black-300 mb-1">
                {label}
              </span>
              <input
                type="text"
                value={identity[key]}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="input-field"
                data-testid={`account-identity-${key}-${account.id}`}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void saveIdentity()}
          disabled={busy}
          className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
          data-testid={`account-identity-save-${account.id}`}
        >
          Save identity
        </button>
      </div>

      {/* Daily limits (LinkedIn actions) */}
      {isLinkedin ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setLimitsOpen((v) => !v)}
            className="flex items-center gap-2 text-13 font-semibold text-white"
            aria-expanded={limitsOpen}
            data-testid={`account-limits-toggle-${account.id}`}
          >
            Manage limits
            <ChevronDown
              className={`h-4 w-4 text-black-400 transition-transform ${
                limitsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {limitsOpen && (
            <div className="space-y-3">
              <p className="text-12 text-black-400">
                Maximum number of LinkedIn actions per day for this account:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WARMUP_LIMIT_ROWS.map((row) => (
                  <label key={row.key} className="block">
                    <span className="block text-12 font-medium text-black-300 mb-1">
                      {row.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={limits[row.key]}
                      onChange={(e) =>
                        setLimits((prev) => ({
                          ...prev,
                          [row.key]: Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          ),
                        }))
                      }
                      className="input-field"
                      data-testid={`account-limit-${row.key}-${account.id}`}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void saveLimits()}
                disabled={busy}
                className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
                data-testid={`account-limits-save-${account.id}`}
              >
                Save limits
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-12 text-black-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Daily action limits apply to LinkedIn accounts.
        </p>
      )}

      {savedNote && (
        <p className="text-12 text-emerald-300" role="status">
          {savedNote}
        </p>
      )}
    </div>
  );
}

function AddAccountCard({
  channel,
  isDemo,
}: {
  channel: "linkedin" | "email";
  isDemo?: boolean;
}) {
  const isLinkedin = channel === "linkedin";
  return (
    <div className="rounded-2xl border border-dashed border-black-600 bg-black-800/30 p-5 space-y-3">
      <h3 className="flex items-center gap-2 text-14 font-semibold text-white">
        <Plus className="h-4 w-4 text-purple-300" />
        Add a {isLinkedin ? "LinkedIn" : "email"} account
      </h3>
      {isLinkedin ? (
        <>
          <p className="text-13 text-black-300 leading-relaxed">
            LinkedIn accounts are connected through an approved LinkedIn
            integration — NxtSend never asks for your LinkedIn password
            or session cookies. When a provider is connected, its
            accounts appear here automatically.
          </p>
          <Link
            href="/dashboard/integrations/linkedin"
            className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
            data-testid="account-add-linkedin"
          >
            Open the LinkedIn integration →
          </Link>
        </>
      ) : (
        <>
          <p className="text-13 text-black-300 leading-relaxed">
            Connect a real mailbox with OAuth — you consent on the
            provider&apos;s own screen; NxtSend never asks for a mailbox
            password. Once connected, the mailbox appears here, campaigns
            can select it as their email account, and their steps send
            From that address. Resend domain sending stays available on
            the Resend integration.
          </p>
          {isDemo && (
            <p
              className="text-12.5 text-amber-200/90 leading-relaxed"
              data-testid="account-add-email-demo-note"
            >
              Demo Mode: mailbox connection is disabled here — it needs
              live mode with the OAuth client configured (SETUP.md §15).
              Nothing can be connected (or faked) in Demo Mode; the
              options below open the live setup pages.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Link
              href="/dashboard/integrations/gmail"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-gmail"
            >
              Connect a Gmail / Google Workspace mailbox →
            </Link>
            <Link
              href="/dashboard/integrations/microsoft"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-microsoft"
            >
              Connect an Outlook / Microsoft 365 mailbox →
            </Link>
            <Link
              href="/dashboard/integrations/resend"
              className="inline-flex items-center gap-1.5 text-13 font-medium text-purple-300 hover:text-purple-200"
              data-testid="account-add-email"
            >
              Open the Resend email integration →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ConnectedAccountsPage() {
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const isDemo = accountsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ConnectedAccount | null>(null);
  // OAuth round-trip notice: the connect/callback routes redirect
  // here with ?oauth_connected=<provider>&mailbox=<addr> or
  // ?oauth_error=<code> — rendered once, dismissible, honest text.
  const [oauthNotice, setOauthNotice] = React.useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("oauth_connected");
    const oauthError = params.get("oauth_error");
    if (connected === "google" || connected === "microsoft") {
      const mailbox = params.get("mailbox");
      setOauthNotice({
        kind: "success",
        text: `${connected === "google" ? "Gmail" : "Outlook"} mailbox ${mailbox ?? ""} is now connected. Campaigns that select it as their email account send from that address.`,
      });
    } else if (oauthError) {
      const texts: Record<string, string> = {
        demo_mode:
          "Demo Mode: mailboxes can't be connected here. Connecting runs in live mode with the OAuth client configured (SETUP.md §15). Nothing was connected.",
        not_configured:
          "The mailbox connection stopped: the OAuth configuration is incomplete on the server. Nothing was connected — see the Gmail / Outlook integration page for the missing items.",
        state_invalid:
          "The mailbox connection could not be verified (the OAuth state expired or didn't match your session). Nothing was stored — start the connection again from the integration page.",
        exchange_failed:
          "The provider rejected the authorization code exchange. Nothing was stored — try again, and check the OAuth client configuration if it repeats.",
        profile_failed:
          "The mailbox profile could not be fetched after consent, so no connection was recorded. Nothing was stored.",
        storage_failed:
          "The mailbox connection could not be stored on the server. Nothing was connected.",
        provider_denied:
          "The provider sign-in was cancelled or denied. Nothing was connected.",
        invalid_callback:
          "The provider returned without the expected parameters. Nothing was connected.",
      };
      setOauthNotice({
        kind: "error",
        text: texts[oauthError] ?? `The mailbox connection did not complete (${oauthError}). Nothing was connected.`,
      });
    }
  }, []);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [linkedinProvider, setLinkedinProvider] = React.useState<{
    status: string;
    statusMessage: string;
  } | null>(null);

  // The LinkedIn PROVIDER state (Integration Center status API) is a
  // separate fact from each account's recorded health — the LinkedIn
  // section shows both, side by side, so a healthy account record is
  // never mistaken for a working LinkedIn connection.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const entry = (json.integrations ?? []).find(
          (i: { id?: string; descriptor?: { id?: string } }) =>
            (i.descriptor?.id ?? i.id) === "linkedin"
        );
        if (entry) {
          setLinkedinProvider({
            status: entry.status,
            statusMessage: entry.statusMessage,
          });
        }
      })
      .catch(() => {
        /* the section renders without the provider note */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = React.useCallback(
    async (ws: string) => {
      setAccounts(await accountsRepo.listAccounts(ws));
    },
    [accountsRepo]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (ws) await refresh(ws);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load connected accounts."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleAccountChange = React.useCallback(
    (updated: ConnectedAccount) => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    },
    []
  );

  const handleUpdate = async (
    id: string,
    patch: Partial<ConnectedAccount>
  ) => {
    setError(null);
    try {
      const updated = await accountsRepo.updateAccount(id, patch);
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the account."
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !workspaceId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await accountsRepo.deleteAccount(workspaceId, deleteTarget.id);
      // Mirror ON DELETE SET NULL in the demo store: campaigns keep
      // working, their account reference is cleared.
      const campaigns = await campaignsRepo.listCampaigns(workspaceId);
      for (const c of campaigns) {
        const patch: {
          sender_account_id?: null;
          email_account_id?: null;
        } = {};
        if (c.sender_account_id === deleteTarget.id)
          patch.sender_account_id = null;
        if (c.email_account_id === deleteTarget.id)
          patch.email_account_id = null;
        if (Object.keys(patch).length > 0) {
          await campaignsRepo.updateCampaign(c.id, patch);
        }
      }
      setDeleteTarget(null);
      await refresh(workspaceId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the account."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const linkedinAccounts = accounts.filter((a) => a.channel === "linkedin");
  const emailAccounts = accounts.filter((a) => a.channel === "email");

  return (
    <div className="space-y-7 pb-14">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Connected Accounts
          </h1>
          {isDemo && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300 max-w-2xl">
          The accounts your campaigns send from. Each account carries its
          warm-up state, its daily limits and the sender identity behind
          the {"{my_*}"} message variables.
        </p>
        {isDemo && (
          <p className="mt-2 flex items-start gap-1.5 text-12 text-black-400 max-w-2xl">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Demo Mode: the accounts below are simulated records stored in
            this browser. Nothing here connects to LinkedIn or an email
            provider.
          </p>
        )}
      </div>

      {oauthNotice && (
        <div
          className={`rounded-2xl border px-5 py-3 text-13 flex items-start justify-between gap-3 ${
            oauthNotice.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/20 text-rose-200"
          }`}
          role="status"
          data-testid="oauth-notice"
        >
          <span>{oauthNotice.text}</span>
          <button
            type="button"
            onClick={() => setOauthNotice(null)}
            className="shrink-0 text-12 font-medium opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="glass-card p-12 text-center text-13 text-black-400">
          Loading accounts…
        </div>
      ) : (
        <>
          {/* LinkedIn accounts */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-16 font-semibold text-white">
              <Linkedin className="h-5 w-5 text-[#4b9be0]" />
              LinkedIn accounts
            </h2>
            {linkedinProvider && (
              <p
                className="flex items-start gap-1.5 text-12 text-black-400 max-w-2xl"
                data-testid="linkedin-provider-note"
              >
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  LinkedIn provider: {linkedinProvider.status}.{" "}
                  {linkedinProvider.statusMessage} An account&apos;s
                  health below is its own recorded state — it does not
                  change this provider status.
                </span>
              </p>
            )}
            {linkedinAccounts.length === 0 && (
              <p className="text-13 text-black-400">
                No LinkedIn account is connected yet.
              </p>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4.5 items-start">
              {linkedinAccounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  workspaceId={workspaceId}
                  onUpdate={handleUpdate}
                  onAccountChange={handleAccountChange}
                  onDelete={setDeleteTarget}
                />
              ))}
              <AddAccountCard channel="linkedin" isDemo={isDemo} />
            </div>
          </section>

          {/* Email accounts */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-16 font-semibold text-white">
              <Mail className="h-5 w-5 text-emerald-400" />
              Email accounts
            </h2>
            {emailAccounts.length === 0 && (
              <p className="text-13 text-black-400">
                No email account is connected yet.
              </p>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4.5 items-start">
              {emailAccounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  workspaceId={workspaceId}
                  onUpdate={handleUpdate}
                  onAccountChange={handleAccountChange}
                  onDelete={setDeleteTarget}
                />
              ))}
              <AddAccountCard channel="email" isDemo={isDemo} />
            </div>
          </section>
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-16 font-semibold text-white">
              Delete this account?
            </h3>
            <p className="text-13 text-black-300 leading-relaxed">
              “{deleteTarget.display_name}” will be removed. Campaigns
              that send from this account are <strong>not</strong>{" "}
              deleted — their account reference is cleared and they fall
              back to the workspace sending state.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors disabled:opacity-50"
              >
                Keep account
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-13 font-semibold text-white transition-colors disabled:opacity-50"
                data-testid="account-delete-confirm"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
