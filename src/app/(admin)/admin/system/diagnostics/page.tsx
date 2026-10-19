"use client";

import * as React from "react";
import {
  AdminPageHeader,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { EnvPresence } from "@/lib/admin/platform-server";

interface DiagnosticsResponse {
  mode: string;
  app: { name: string; version: string };
  runtime: {
    node: string;
    env: string;
    uptime_seconds: number;
    platform: string;
  };
  dataMode: string;
  env: EnvPresence[];
  generatedAt: string;
  notes: string[];
}

interface ConfigStatusResponse {
  mode: string;
  groups: Array<{
    group: string;
    label: string;
    vars: Array<{
      name: string;
      visibility: "public" | "server";
      requiredForLive: boolean;
      purpose: string;
      status: "present_valid" | "present_placeholder" | "missing";
    }>;
    valid: number;
    placeholder: number;
    missing: number;
  }>;
  totals: { valid: number; placeholder: number; missing: number; total: number };
  missingRequiredForLive: string[];
  placeholderVars: string[];
  liveReady: boolean;
  notes: string[];
}

const CONFIG_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  present_valid: { label: "Set", cls: "text-emerald-400" },
  present_placeholder: { label: "Placeholder!", cls: "text-amber-400" },
  missing: { label: "Missing", cls: "text-rose-400" },
};

/**
 * Admin → System → Development Diagnostics. Build/runtime facts from
 * the server process itself (package.json version, Node version,
 * data mode, env presence matrix). No request data, no user data,
 * no secret values.
 */
export default function AdminDiagnosticsPage() {
  const { data, error, loading, reload } = useAdminFetch<DiagnosticsResponse>(
    "/api/admin/diagnostics"
  );
  const config = useAdminFetch<ConfigStatusResponse>("/api/admin/config-status");

  return (
    <div className="space-y-6 pb-14 max-w-5xl">
      <AdminPageHeader
        title="Development Diagnostics"
        description="What this deployment is actually running: build version, runtime, data mode, and configuration presence. Useful when triaging 'works on my machine' reports."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading diagnostics…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                App version
              </p>
              <p className="text-20 font-bold text-white mt-1">
                {data.app.name}@{data.app.version}
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Node runtime
              </p>
              <p className="text-20 font-bold text-white mt-1">{data.runtime.node}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Environment
              </p>
              <p className="text-20 font-bold text-white mt-1 capitalize">
                {data.runtime.env}
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Data mode
              </p>
              <p className="text-20 font-bold text-white mt-1 capitalize">
                {data.dataMode}
              </p>
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-3">Runtime facts</h2>
            <dl className="space-y-2 text-13">
              <div className="flex gap-3">
                <dt className="text-black-400 w-44 shrink-0">Platform</dt>
                <dd className="text-black-100">{data.runtime.platform}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-black-400 w-44 shrink-0">Process uptime</dt>
                <dd className="text-black-100">
                  {Math.floor(data.runtime.uptime_seconds / 60)}m{" "}
                  {data.runtime.uptime_seconds % 60}s (this server instance)
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-black-400 w-44 shrink-0">Generated</dt>
                <dd className="text-black-100">{fmtDateTime(data.generatedAt)}</dd>
              </div>
            </dl>
            <ul className="list-disc pl-5 mt-4 space-y-1.5 text-12 text-black-400">
              {data.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-2">
              Configuration status by feature
            </h2>
            <p className="text-12 text-black-400 mb-4">
              Every variable from <code>.env.example</code>, classified as
              Set / still-the-example-Placeholder / Missing — values are
              never shown. A “Set” here means a plausible value exists;
              provider verification happens per integration (Test
              Connection). Source: <code>GET /api/admin/config-status</code>{" "}
              (also: <code>npm run config:check</code>).
            </p>
            {config.loading && <LoadingState label="Loading configuration status…" />}
            {config.error && (
              <ErrorState message={config.error} onRetry={config.reload} />
            )}
            {config.data && (
              <div className="space-y-5">
                <div
                  className={`rounded-xl border px-4 py-3 text-13 ${
                    config.data.liveReady
                      ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-200"
                      : "border-amber-500/30 bg-amber-600/10 text-amber-200"
                  }`}
                >
                  {config.data.liveReady
                    ? "All variables required for live (non-demo) operation are set."
                    : `Not live-ready: ${config.data.missingRequiredForLive.length} required variable(s) missing or placeholder — ${config.data.missingRequiredForLive.join(", ") || "none"}.`}{" "}
                  Totals: {config.data.totals.valid} set ·{" "}
                  {config.data.totals.placeholder} placeholder ·{" "}
                  {config.data.totals.missing} missing (of{" "}
                  {config.data.totals.total}).
                </div>
                {config.data.groups.map((group) => (
                  <div key={group.group}>
                    <h3 className="text-13 font-semibold text-white mb-1.5">
                      {group.label}{" "}
                      <span className="text-11 font-medium text-black-400">
                        ({group.valid} set · {group.placeholder} placeholder ·{" "}
                        {group.missing} missing)
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      {group.vars.map((v) => {
                        const style = CONFIG_STATUS_STYLES[v.status];
                        return (
                          <div
                            key={v.name}
                            className="flex items-center justify-between gap-3 py-1.5 border-b border-black-800/60"
                            title={v.purpose}
                          >
                            <span className="text-12 font-mono text-black-200 truncate">
                              {v.name}
                              {v.requiredForLive && (
                                <span className="ml-1.5 text-10 font-bold text-purple-300">
                                  REQUIRED
                                </span>
                              )}
                            </span>
                            <span
                              className={`text-11 font-bold uppercase tracking-wider shrink-0 ${style.cls}`}
                            >
                              {style.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <ul className="list-disc pl-5 space-y-1.5 text-12 text-black-400">
                  {config.data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-4">
              Environment presence (names only)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {data.env.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-black-800/60"
                >
                  <span className="text-12 font-mono text-black-200 truncate">
                    {entry.name}
                  </span>
                  <span
                    className={`text-11 font-bold uppercase tracking-wider ${
                      entry.present ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {entry.present ? "Set" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
