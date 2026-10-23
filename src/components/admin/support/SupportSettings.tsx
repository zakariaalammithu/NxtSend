"use client";

/**
 * Admin → Support → Chat Settings (P10 Stage F).
 *
 * Super-admin surface: the behaviour switches + copy the widget
 * actually serves, and the support-agents manager. The settings API
 * is super-admin-only INCLUDING reads, so a non-super admin gets a
 * clear "managed by the super admin" state here (from the 403), not
 * an error crash. The agents list is readable by any enabled agent:
 * an agent can set their OWN availability; enabling/disabling agents
 * and changing others' availability are super-admin actions (API
 * enforced; 403s surface as notices).
 *
 * Every control persists through the API — no decorative toggles.
 * Availability is a DECLARED state (an agent's own toggle), never
 * presented as live presence.
 */

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { AdminPageHeader, ErrorState, LoadingState, ModeNote } from "@/components/admin/AdminBits";
import { cn } from "@/lib/utils";
import type { SupportAgentView, SupportSettings as Settings } from "@/lib/support/types";
import {
  errorText,
  isSuper,
  resolveMe,
  supportApi,
  type AgentsResponse,
  type SettingsResponse,
} from "./api";

const inputCls =
  "w-full rounded-xl border border-black-700 bg-black-800 px-3 py-2 text-13 text-white placeholder:text-black-500 focus:border-rose-500 focus:outline-none";
const labelCls = "block text-12 font-semibold text-black-200 mb-1.5";

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-black-700/60 bg-black-800/40 px-4 py-3">
      <div>
        <p className="text-13 font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-12 leading-relaxed text-black-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition disabled:opacity-40",
          checked ? "bg-emerald-500" : "bg-black-600"
        )}
      >
        <span className={cn("block h-5 w-5 rounded-full bg-white transition", checked && "translate-x-5")} />
      </button>
    </div>
  );
}

export function SupportSettings() {
  const [mode, setMode] = React.useState("demo");
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [aiConfigured, setAiConfigured] = React.useState(false);
  const [aiProvider, setAiProvider] = React.useState<string | null>(null);
  const [settingsForbidden, setSettingsForbidden] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const [agents, setAgents] = React.useState<SupportAgentView[]>([]);
  const [me, setMe] = React.useState<SupportAgentView | null>(null);
  const [agentNotice, setAgentNotice] = React.useState<string | null>(null);
  const [agentsForbidden, setAgentsForbidden] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const settingsRes = await supportApi<SettingsResponse>("/api/admin/support/settings");
      if (settingsRes.status === 403) {
        setSettingsForbidden(true);
      } else if (!settingsRes.ok) {
        setLoadError(errorText(settingsRes));
      } else {
        setMode(settingsRes.body.mode);
        setSettings(settingsRes.body.settings);
        setAiConfigured(settingsRes.body.ai_enhancement_configured);
        setAiProvider(settingsRes.body.ai_enhancement_provider);
      }
      const agentsRes = await supportApi<AgentsResponse>("/api/admin/support/agents");
      if (agentsRes.status === 403) {
        setAgentsForbidden(true);
      } else if (agentsRes.ok) {
        setMode(agentsRes.body.mode);
        setAgents(agentsRes.body.agents);
        setMe(await resolveMe(agentsRes.body.agents, agentsRes.body.mode));
      }
      setLoading(false);
    })();
  }, []);

  const superAdmin = isSuper(me);

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    const res = await supportApi<SettingsResponse>("/api/admin/support/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(errorText(res));
      return;
    }
    setSettings(res.body.settings);
    setSavedNote("Saved — the widget picks this up on its next config read.");
  };

  const saveCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await saveSettings({
      display_name: settings.display_name,
      greeting: settings.greeting,
      welcome_message: settings.welcome_message,
      offline_message: settings.offline_message,
      closing_message: settings.closing_message,
      support_email: settings.support_email,
    });
  };

  const updateAgent = async (
    agent: SupportAgentView,
    patch: { enabled?: boolean; availability?: string }
  ) => {
    setAgentNotice(null);
    const res = await supportApi<AgentsResponse>("/api/admin/support/agents", {
      method: "PUT",
      body: JSON.stringify({ profile_id: agent.profile_id, ...patch }),
    });
    if (!res.ok) {
      setAgentNotice(errorText(res));
      return;
    }
    const list = await supportApi<AgentsResponse>("/api/admin/support/agents");
    if (list.ok) setAgents(list.body.agents);
  };

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        title="Chat Settings"
        description="How the support assistant behaves on the website, and who is on the support team. Changes save to the database and apply to the live widget."
        badge={mode === "demo" ? "Demo Mode" : undefined}
      />
      <ModeNote mode={mode} />

      {loading ? (
        <LoadingState label="Loading chat settings…" />
      ) : (
        <>
          {loadError && <ErrorState message={loadError} />}

          {settingsForbidden ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 px-5 py-4 text-13 text-amber-200 flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Settings are managed by the super admin.</p>
                <p className="mt-1 leading-relaxed">
                  Chat behaviour, copy and availability switches can only be viewed and changed
                  by a super admin. You can still manage your own availability below if you are
                  an enabled support agent.
                </p>
              </div>
            </div>
          ) : settings ? (
            <>
              <div className="glass-card p-5 space-y-3">
                <h2 className="text-15 font-bold text-white">Behaviour</h2>
                <Toggle
                  label="Knowledge-base answers"
                  description="The assistant answers from published knowledge-base entries. Off = every question gets the fallback message."
                  checked={settings.ai_kb_enabled}
                  onChange={(v) => void saveSettings({ ai_kb_enabled: v })}
                />
                <Toggle
                  label="AI enhancement (grounded rewriting)"
                  description={
                    aiConfigured
                      ? `Provider configured (${aiProvider ?? "connected"}): answers may be rephrased using ONLY the matched knowledge entries — never free-form.`
                      : "No AI provider key is configured, so this switch currently has no effect: answers stay deterministic knowledge matches either way."
                  }
                  checked={settings.ai_enhancement_enabled}
                  onChange={(v) => void saveSettings({ ai_enhancement_enabled: v })}
                />
                <p className="text-12 text-black-400">
                  AI enhancement status:{" "}
                  <strong className={aiConfigured ? "text-emerald-300" : "text-amber-300"}>
                    {aiConfigured ? "Configured" : "Not configured"}
                  </strong>{" "}
                  — based on the server-side provider keys, not on the switch above.
                </p>
                <Toggle
                  label="Live human support"
                  description="Visitors can reach the support inbox. Off = the widget is assistant-only and shows the offline message for anything it cannot answer."
                  checked={settings.live_support_enabled}
                  onChange={(v) => void saveSettings({ live_support_enabled: v })}
                />
                <Toggle
                  label="Let visitors request a person"
                  description="Shows the “Talk to a person” escalation in the widget. Requires live human support to be on."
                  checked={settings.allow_user_escalation}
                  onChange={(v) => void saveSettings({ allow_user_escalation: v })}
                />
                {saving && (
                  <p className="flex items-center gap-2 text-12 text-black-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </p>
                )}
                {savedNote && <p className="text-12 text-emerald-300">{savedNote}</p>}
                {saveError && <p role="alert" className="text-12 text-rose-300">{saveError}</p>}
              </div>

              <form onSubmit={(e) => void saveCopy(e)} className="glass-card p-5 space-y-4">
                <h2 className="text-15 font-bold text-white">Assistant copy</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="cs-name">Assistant display name</label>
                    <input id="cs-name" value={settings.display_name} onChange={(e) => setSettings({ ...settings, display_name: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="cs-email">Support email</label>
                    <input id="cs-email" value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls} htmlFor="cs-greeting">Greeting (shown before the first message)</label>
                  <textarea id="cs-greeting" value={settings.greeting} onChange={(e) => setSettings({ ...settings, greeting: e.target.value })} rows={2} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="cs-welcome">Welcome message (first message in a new conversation)</label>
                  <textarea id="cs-welcome" value={settings.welcome_message} onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })} rows={3} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="cs-offline">Offline message (no agent available)</label>
                  <textarea id="cs-offline" value={settings.offline_message} onChange={(e) => setSettings({ ...settings, offline_message: e.target.value })} rows={3} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="cs-closing">Closing message (sent when a conversation is resolved)</label>
                  <textarea id="cs-closing" value={settings.closing_message} onChange={(e) => setSettings({ ...settings, closing_message: e.target.value })} rows={3} className={inputCls} />
                </div>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white hover:bg-rose-500 disabled:opacity-40">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save copy
                </button>
              </form>
            </>
          ) : null}

          {/* Agents manager */}
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-15 font-bold text-white">Support agents</h2>
            <p className="text-12 leading-relaxed text-black-400">
              Only enabled agents can open the support inbox. Availability is a state each agent
              declares for themselves — it is not live presence tracking. The widget tells
              visitors an agent is available only when at least one eligible agent has declared
              “Available”.
            </p>
            {agentNotice && (
              <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-12 text-rose-200">
                {agentNotice}
              </p>
            )}
            {agentsForbidden ? (
              <p className="text-13 text-black-400">
                The agents list is available to enabled support agents and the super admin.
              </p>
            ) : (
              <ul className="divide-y divide-black-800">
                {agents.map((agent) => {
                  const isMe = me?.profile_id === agent.profile_id;
                  const canToggleEnabled = superAdmin;
                  const canSetAvailability = superAdmin || isMe;
                  return (
                    <li key={agent.profile_id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-[200px]">
                        <p className="text-13 font-semibold text-white">
                          {agent.full_name ?? agent.email}
                          {isMe && <span className="ml-1.5 text-11 font-bold text-rose-300">(you)</span>}
                        </p>
                        <p className="text-12 text-black-400">
                          {agent.email} · {agent.role === "super_admin" ? "Super admin" : "Admin"} ·{" "}
                          {agent.profile_status}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-10 font-bold", agent.eligible ? "bg-emerald-500/15 text-emerald-300" : "bg-black-700 text-black-300")}>
                        {agent.eligible ? "Eligible agent" : agent.enabled ? "Enabled, not eligible" : "Not an agent"}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-12 text-black-300">
                          On support team
                          <button
                            type="button"
                            role="switch"
                            aria-checked={agent.enabled}
                            aria-label={`Enable ${agent.full_name ?? agent.email} as a support agent`}
                            disabled={!canToggleEnabled}
                            title={!canToggleEnabled ? "Only a super admin can enable or disable agents" : undefined}
                            onClick={() => void updateAgent(agent, { enabled: !agent.enabled })}
                            className={cn("h-5 w-9 rounded-full p-0.5 transition disabled:opacity-40", agent.enabled ? "bg-emerald-500" : "bg-black-600")}
                          >
                            <span className={cn("block h-4 w-4 rounded-full bg-white transition", agent.enabled && "translate-x-4")} />
                          </button>
                        </label>
                        <select
                          value={agent.availability}
                          disabled={!canSetAvailability}
                          aria-label={`Availability for ${agent.full_name ?? agent.email}`}
                          title={!canSetAvailability ? "Agents set their own availability" : undefined}
                          onChange={(e) => void updateAgent(agent, { availability: e.target.value })}
                          className="rounded-lg border border-black-700 bg-black-800 px-2 py-1.5 text-12 text-white disabled:opacity-50"
                        >
                          <option value="available">Available</option>
                          <option value="busy">Busy</option>
                          <option value="offline">Offline</option>
                        </select>
                      </span>
                    </li>
                  );
                })}
                {agents.length === 0 && (
                  <li className="py-4 text-13 text-black-400">No admin profiles found.</li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
