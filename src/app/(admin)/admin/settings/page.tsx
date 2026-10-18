"use client";

import * as React from "react";
import { Save, Check, AlertTriangle } from "lucide-react";

export default function AdminSettingsPage() {
  const [appName, setAppName] = React.useState("NxtSend");
  const [publicUrl, setPublicUrl] = React.useState("https://app.nxtsend.com");
  const [supportEmail, setSupportEmail] = React.useState("support@nxtsend.com");
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);

  // Feature Flags
  const [flagMultichannel, setFlagMultichannel] = React.useState(true);
  const [flagAiPersonalization, setFlagAiPersonalization] = React.useState(true);
  const [flagHubspotSync, setFlagHubspotSync] = React.useState(false);
  const [flagWebhookDispatch, setFlagWebhookDispatch] = React.useState(true);

  const [saved, setSaved] = React.useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-7 pb-14 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Platform Settings & Feature Flags
          </h1>
          <span className="demo-badge">Global Config</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Configure application metadata, maintenance controls, and rollout feature toggles.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* General App Info */}
        <div className="glass-card p-6 sm:p-8 space-y-5">
          <h3 className="text-16 font-semibold text-white">
            General Configuration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Application Name
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
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

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              Public App URL
            </label>
            <input
              type="url"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="glass-card p-6 sm:p-8 space-y-4 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-16 font-semibold text-white">
                Platform Maintenance Mode
              </h3>
              <p className="text-12 text-black-400 mt-0.5">
                When active, non-admin users will be presented with a scheduled maintenance screen.
              </p>
            </div>
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="h-5 w-5 rounded border-black-600 bg-black-800 text-rose-600 focus:ring-rose-500"
            />
          </div>

          {maintenanceMode && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-12 text-amber-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Maintenance mode is toggled ON. Regular user logins and sequence dispatches will be paused.
              </span>
            </div>
          )}
        </div>

        {/* Feature Flags */}
        <div className="glass-card p-6 sm:p-8 space-y-5">
          <h3 className="text-16 font-semibold text-white">
            Feature Flags & Rollout Toggles
          </h3>

          <div className="divide-y divide-black-700/60">
            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">
                  Multichannel Sequence Engine
                </p>
                <p className="text-12 text-black-400">
                  Allow users to mix LinkedIn and email touches in a unified sequence.
                </p>
              </div>
              <input
                type="checkbox"
                checked={flagMultichannel}
                onChange={(e) => setFlagMultichannel(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">
                  AI Personalization Engine
                </p>
                <p className="text-12 text-black-400">
                  Enable automatic variable insertion and tone enhancement for drafts.
                </p>
              </div>
              <input
                type="checkbox"
                checked={flagAiPersonalization}
                onChange={(e) => setFlagAiPersonalization(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">
                  HubSpot CRM Sync Adapter
                </p>
                <p className="text-12 text-black-400">
                  Beta bi-directional contact synchronization with HubSpot CRM.
                </p>
              </div>
              <input
                type="checkbox"
                checked={flagHubspotSync}
                onChange={(e) => setFlagHubspotSync(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">
                  Real-time Webhook Dispatcher
                </p>
                <p className="text-12 text-black-400">
                  Emit HTTP POST events on lead conversion and positive replies.
                </p>
              </div>
              <input
                type="checkbox"
                checked={flagWebhookDispatch}
                onChange={(e) => setFlagWebhookDispatch(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>
          </div>
        </div>

        {/* Save Controls */}
        <div className="flex items-center justify-between pt-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-13 text-emerald-400 font-medium">
              <Check className="h-4 w-4" />
              <span>Settings updated successfully!</span>
            </span>
          )}
          <div className="ml-auto">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-orange transition-all"
            >
              <Save className="h-4 w-4" />
              <span>Save Platform Settings</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
