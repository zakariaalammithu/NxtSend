"use client";

import * as React from "react";
import { Siren, ShieldAlert } from "lucide-react";
import {
  ErrorState,
  LoadingState,
  ModeNote,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { AdminSettings } from "@/lib/admin/settings-core";

interface SettingsResponse {
  mode: string;
  settings: AdminSettings;
}

interface ControlDef {
  key: "signups_open" | "demo_banner_enabled";
  title: string;
  description: string;
  /** Label for the state where the control is ENGAGED (protective). */
  engagedLabel: string;
  isEngaged: (s: AdminSettings) => boolean;
  /** Value patch that ENGAGES the control. */
  engagePatch: Record<string, boolean>;
  disengagePatch: Record<string, boolean>;
  confirmEngage: string;
  confirmDisengage: string;
}

const CONTROLS: ControlDef[] = [
  {
    key: "signups_open",
    title: "Close signups",
    description:
      "Immediately stops new account creation: the signup page shows a closed message and refuses registrations. Existing users keep full access. Backed by the persisted signups_open setting and enforced on the signup page.",
    engagedLabel: "Signups are CLOSED",
    isEngaged: (s) => !s.signups_open,
    engagePatch: { signups_open: false },
    disengagePatch: { signups_open: true },
    confirmEngage:
      "Close signups now? New visitors will not be able to create an account until you reopen them. This action is written to the audit log.",
    confirmDisengage:
      "Reopen signups? New visitors will be able to create accounts again. This action is written to the audit log.",
  },
  {
    key: "demo_banner_enabled",
    title: "Force demo banner",
    description:
      "Forces the demo-mode notice strip on in the user dashboard (Demo Mode deployments). Use it to make unmistakably clear that a deployment is not live yet. Persisted as demo_banner_enabled.",
    engagedLabel: "Demo banner is FORCED ON",
    isEngaged: (s) => s.demo_banner_enabled,
    engagePatch: { demo_banner_enabled: true },
    disengagePatch: { demo_banner_enabled: false },
    confirmEngage:
      "Force the demo banner on? Dashboard visitors in Demo Mode will see the notice strip. This action is written to the audit log.",
    confirmDisengage:
      "Turn the demo banner off? Demo Mode deployments will stop showing the notice strip. This action is written to the audit log.",
  },
];

/**
 * Admin → Security/Settings → Emergency Controls. Safeguarded by
 * design: every live control here is reversible, sits behind an
 * explicit confirmation, goes through the admin-gated settings API,
 * and lands in the audit log. Destructive operations (data deletion,
 * workspace purges) are deliberately NOT implemented — they are shown
 * as disabled placeholders explaining what would be required, rather
 * than shipped as one-click hazards.
 */
export default function AdminEmergencyPage() {
  const { data, error, loading, reload } = useAdminFetch<SettingsResponse>(
    "/api/admin/settings"
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNote, setActionNote] = React.useState<string | null>(null);

  async function toggle(control: ControlDef) {
    if (!data) return;
    const engaged = control.isEngaged(data.settings);
    const confirmed = window.confirm(
      engaged ? control.confirmDisengage : control.confirmEngage
    );
    if (!confirmed) return;

    setBusy(control.key);
    setActionError(null);
    setActionNote(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          engaged ? control.disengagePatch : control.engagePatch
        ),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setActionNote(
        `${control.title}: ${engaged ? "disengaged" : "engaged"}. Recorded in the audit log.`
      );
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to apply the control."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Emergency Controls
          </h1>
          <span className="demo-badge">Safeguarded</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Reversible, confirmation-gated platform controls. Every use is
          written to the audit log with the acting admin.
        </p>
      </div>

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading controls…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {actionError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {actionError}
        </div>
      )}
      {actionNote && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 px-5 py-3 text-13 text-emerald-200">
          {actionNote}
        </div>
      )}

      {data &&
        CONTROLS.map((control) => {
          const engaged = control.isEngaged(data.settings);
          return (
            <div
              key={control.key}
              className="glass-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 justify-between border border-rose-500/20"
            >
              <div className="flex items-start gap-4">
                <Siren className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-16 font-semibold text-white">{control.title}</h3>
                  <p className="text-13 text-black-400 mt-1 max-w-xl">
                    {control.description}
                  </p>
                  <p
                    className={`text-12 font-bold mt-2 ${
                      engaged ? "text-rose-300" : "text-black-400"
                    }`}
                  >
                    {engaged ? control.engagedLabel : "Not engaged"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy === control.key}
                onClick={() => toggle(control)}
                className={`shrink-0 rounded-xl px-5 py-2.5 text-13 font-semibold transition-colors disabled:opacity-50 ${
                  engaged
                    ? "border border-black-600 bg-black-800 text-white hover:bg-black-700"
                    : "bg-rose-600 hover:bg-rose-500 text-white"
                }`}
              >
                {busy === control.key
                  ? "Applying…"
                  : engaged
                    ? "Disengage"
                    : "Engage"}
              </button>
            </div>
          );
        })}

      {/* Destructive actions: documented, deliberately not implemented */}
      <div className="glass-card p-6 sm:p-8 space-y-4 opacity-80">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-black-400" />
          <h3 className="text-16 font-semibold text-white">
            Destructive actions — not available
          </h3>
        </div>
        <ul className="space-y-3 text-13 text-black-400 list-disc pl-5">
          <li>
            <strong className="text-black-200">Purge demo data / delete workspace data:</strong>{" "}
            intentionally not implemented as a one-click control. Irreversible
            deletion requires an offline, reviewed procedure (verified backup,
            typed confirmation, dual-admin approval) that this console does not
            currently provide — shipping a delete button without those
            safeguards would be a hazard, not a feature.
          </li>
          <li>
            <strong className="text-black-200">Revoke all sessions:</strong>{" "}
            Supabase Auth exposes session administration per user; a global
            revoke is not wired because it would sign out every customer
            without a recovery path. Per-user suspension (Admin → Users)
            already takes effect at the target&rsquo;s next sign-in and immediately
            for admin API calls.
          </li>
        </ul>
      </div>
    </div>
  );
}
