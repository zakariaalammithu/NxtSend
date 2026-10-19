"use client";

import * as React from "react";
import { Save, Check } from "lucide-react";
import {
  AdminPageHeader,
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

/**
 * Admin → System → Campaign Settings. Global outreach defaults,
 * persisted through the same settings substrate as System Settings
 * (admin_settings; audit-logged on change). These are DEFAULTS for
 * new campaigns/workspace setups — per-plan caps live in Credit Rules
 * and per-account safety limits belong to the (authorized-provider)
 * sending layer. The sequence executor that will consume these
 * defaults is not built yet; that dependency is stated, not hidden.
 */
export default function AdminCampaignSettingsPage() {
  const { data, error, loading, reload } = useAdminFetch<SettingsResponse>(
    "/api/admin/settings"
  );
  const [connections, setConnections] = React.useState("20");
  const [messages, setMessages] = React.useState("50");
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!data) return;
    setConnections(String(data.settings.default_daily_connections));
    setMessages(String(data.settings.default_daily_messages));
  }, [data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_daily_connections: Number(connections),
          default_daily_messages: Number(messages),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        changed?: string[];
      };
      if (!res.ok) {
        const fieldErrors = body.fields ? Object.values(body.fields).join(" ") : "";
        throw new Error(body.error ? `${body.error}. ${fieldErrors}` : `Request failed (${res.status})`);
      }
      setNote(
        body.changed && body.changed.length > 0
          ? "Defaults saved and written to the audit log."
          : "Saved — no values changed."
      );
      reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="Campaign Settings"
        description="Global default sending limits applied to new campaigns. Conservative defaults protect sender accounts; per-plan caps are defined under Billing → Credit Rules."
        badge="Persisted"
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading campaign settings…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/20 px-5 py-4 text-13 text-yellow-200">
        <strong>Dependency note:</strong> these defaults are stored and
        auditable today. The server-side sequence executor that will read
        them before dispatching steps has not been built yet (no authorized
        LinkedIn/email sending provider is connected), so changing them does
        not yet change any live sending behaviour — there is no live sending.
      </div>

      {data && (
        <form onSubmit={handleSave} className="glass-card p-6 sm:p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Default daily connection requests (per account)
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={connections}
                onChange={(e) => setConnections(e.target.value)}
                className="input-field"
              />
              <p className="text-12 text-black-500 mt-1.5">
                LinkedIn&rsquo;s own limits apply on top of this; the lower value wins.
              </p>
            </div>
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Default daily messages (per account)
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={messages}
                onChange={(e) => setMessages(e.target.value)}
                className="input-field"
              />
              <p className="text-12 text-black-500 mt-1.5">
                Covers follow-ups across LinkedIn and email sequences.
              </p>
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-13 text-rose-200">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {note && (
              <span className="flex items-center gap-1.5 text-13 text-emerald-400 font-medium">
                <Check className="h-4 w-4" />
                <span>{note}</span>
              </span>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-2.5 text-14 font-semibold text-white transition-all disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? "Saving…" : "Save defaults"}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
