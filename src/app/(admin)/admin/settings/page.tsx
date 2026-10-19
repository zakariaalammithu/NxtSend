"use client";

import * as React from "react";
import { Save, Check, AlertTriangle } from "lucide-react";
import {
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { AdminSettings } from "@/lib/admin/settings-core";

interface SettingsResponse {
  mode: string;
  settings: AdminSettings;
}

/**
 * Admin → Security/Settings → System Settings. REWIRED in Stage D:
 * the previous version of this page kept every value in React state
 * and its Save button simply flashed a success message — nothing was
 * ever persisted. It now loads from and saves to
 * GET/PUT /api/admin/settings (admin_settings table in live mode,
 * demo store in Demo Mode), and every save writes an audit_logs
 * entry naming the changed fields.
 *
 * The old decorative "feature flags" (multichannel / AI / HubSpot /
 * webhook toggles that no code read) were removed rather than
 * re-persisted: feature behaviour is controlled by real integration
 * configuration (see the Integration Center), not by flags nothing
 * enforces.
 */
export default function AdminSettingsPage() {
  const { data, error, loading, reload } = useAdminFetch<SettingsResponse>(
    "/api/admin/settings"
  );

  const [siteName, setSiteName] = React.useState("");
  const [supportEmail, setSupportEmail] = React.useState("");
  const [demoBannerEnabled, setDemoBannerEnabled] = React.useState(true);
  const [signupsOpen, setSignupsOpen] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!data) return;
    setSiteName(data.settings.site_name);
    setSupportEmail(data.settings.support_email);
    setDemoBannerEnabled(data.settings.demo_banner_enabled);
    setSignupsOpen(data.settings.signups_open);
  }, [data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_name: siteName,
          support_email: supportEmail,
          demo_banner_enabled: demoBannerEnabled,
          signups_open: signupsOpen,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        changed?: string[];
      };
      if (!res.ok) {
        const fieldErrors = body.fields
          ? Object.values(body.fields).join(" ")
          : "";
        throw new Error(body.error ? `${body.error}. ${fieldErrors}` : `Request failed (${res.status})`);
      }
      setSavedNote(
        body.changed && body.changed.length > 0
          ? `Saved. Changed: ${body.changed.join(", ")}. The change was written to the audit log.`
          : "Saved. No values changed."
      );
      reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7 pb-14 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            System Settings
          </h1>
          <span className="demo-badge">Global Config</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Platform-wide settings that persist — site identity, the demo
          banner, and whether new signups are open. Changes are validated
          server-side and recorded in the audit log.
        </p>
      </div>

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading settings…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="glass-card p-6 sm:p-8 space-y-5">
            <h3 className="text-16 font-semibold text-white">General Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-13 font-medium text-black-200 mb-1.5">
                  Site Name
                </label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-13 font-medium text-black-200 mb-1.5">
                  Support Email
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            {data.settings.updated_at && (
              <p className="text-12 text-black-500">
                Last updated {fmtDateTime(data.settings.updated_at)}.
              </p>
            )}
          </div>

          <div className="glass-card p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-16 font-semibold text-white">New signups open</h3>
                <p className="text-12 text-black-400 mt-0.5">
                  When off, the signup page refuses new registrations with a
                  clear closed message. Existing users can still sign in. The
                  same switch is available under Emergency Controls.
                </p>
              </div>
              <input
                type="checkbox"
                checked={signupsOpen}
                onChange={(e) => setSignupsOpen(e.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-black-600 bg-black-800 text-rose-600 focus:ring-rose-500"
                aria-label="New signups open"
              />
            </div>
            {!signupsOpen && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-12 text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Signups will be closed as soon as you save.</span>
              </div>
            )}
          </div>

          <div className="glass-card p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-16 font-semibold text-white">Demo-mode banner</h3>
                <p className="text-12 text-black-400 mt-0.5">
                  Controls the demo notice strip in the user dashboard when the
                  app runs in Demo Mode. Has no effect on a live deployment
                  beyond being recorded.
                </p>
              </div>
              <input
                type="checkbox"
                checked={demoBannerEnabled}
                onChange={(e) => setDemoBannerEnabled(e.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-black-600 bg-black-800 text-purple-600"
                aria-label="Demo-mode banner enabled"
              />
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-13 text-rose-200">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {savedNote && (
              <span className="flex items-center gap-1.5 text-13 text-emerald-400 font-medium">
                <Check className="h-4 w-4" />
                <span>{savedNote}</span>
              </span>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-orange transition-all disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? "Saving…" : "Save Platform Settings"}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
