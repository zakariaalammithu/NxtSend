"use client";

/**
 * Admin integration view — renders one or more integrations from the
 * SAME status service the user-facing Integration Center uses
 * (GET /api/integrations/status), so the admin console and the
 * workspace view can never disagree about a status. Statuses are
 * derived server-side from actual configuration; a present key shows
 * "Connected but Not Verified" until a Test Connection succeeds, and
 * this component never upgrades a status on its own.
 *
 * Note: in live mode the status API resolves the CALLER's workspace
 * (tenant isolation) — for a platform admin that is their own admin
 * workspace. Platform-level provider configuration itself is env
 * based (Vercel), which the env checklist reflects.
 */

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { IntegrationStatusEntry } from "@/lib/integrations-center/types";

interface StatusResponse {
  mode: string;
  integrations: IntegrationStatusEntry[];
}

function statusClass(status: string): string {
  switch (status) {
    case "Connected and Verified":
      return "text-emerald-300 border-emerald-500/40 bg-emerald-950/30";
    case "Connected but Not Verified":
      return "text-yellow-300 border-yellow-500/40 bg-yellow-950/30";
    case "Demo Mode":
      return "text-orange-300 border-orange-500/40 bg-orange-950/30";
    case "Error":
      return "text-rose-300 border-rose-500/40 bg-rose-950/30";
    default:
      return "text-black-300 border-black-600 bg-black-800/60";
  }
}

export function AdminIntegrationView({
  title,
  description,
  integrationIds,
  children,
}: {
  title: string;
  description: string;
  integrationIds: string[];
  children?: React.ReactNode;
}) {
  const { data, error, loading, reload } = useAdminFetch<StatusResponse>(
    "/api/integrations/status"
  );

  const entries = React.useMemo(() => {
    const all = data?.integrations ?? [];
    return integrationIds
      .map((id) => all.find((e) => e.descriptor.id === id))
      .filter((e): e is IntegrationStatusEntry => Boolean(e));
  }, [data, integrationIds]);

  return (
    <div className="space-y-6 pb-14">
      <div>
        <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-1 text-14 text-black-300">{description}</p>
      </div>

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading integration status…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && entries.length === 0 && (
        <EmptyStateBox
          title="Integration not registered"
          message="This integration is not present in the Integration Center registry."
        />
      )}

      {entries.map((entry) => (
        <div key={entry.descriptor.id} className="glass-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-18 font-bold text-white">{entry.descriptor.name}</h2>
              <p className="text-13 text-black-400 mt-0.5">{entry.descriptor.tagline}</p>
            </div>
            <span
              className={`text-11 font-bold uppercase tracking-wider border rounded-full px-3 py-1 ${statusClass(entry.status)}`}
            >
              {entry.status}
            </span>
          </div>

          <p className="text-13 text-black-300">{entry.statusMessage}</p>
          <p className="text-13 text-black-400">{entry.descriptor.description}</p>

          {entry.lastVerification && (
            <p className="text-12 text-black-400">
              Last verification:{" "}
              <span className={entry.lastVerification.ok ? "text-emerald-400" : "text-rose-400"}>
                {entry.lastVerification.ok ? "succeeded" : "failed"}
              </span>{" "}
              · {fmtDateTime(entry.lastVerification.checkedAt)} ·{" "}
              {entry.lastVerification.message}
            </p>
          )}

          <div>
            <p className="text-11 font-bold uppercase tracking-wider text-black-500 mb-2">
              Configuration (presence only)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
              {entry.envPresence.map((env) => (
                <div
                  key={env.name}
                  className="flex items-center justify-between py-1 border-b border-black-800/60"
                >
                  <span className="text-12 font-mono text-black-200">{env.name}</span>
                  <span
                    className={`text-11 font-bold uppercase tracking-wider ${
                      env.present ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {env.present ? "Set" : "Missing"}
                  </span>
                </div>
              ))}
              {entry.envPresence.length === 0 && (
                <p className="text-12 text-black-500">
                  No environment variables — this integration is not configurable yet.
                </p>
              )}
            </div>
          </div>

          {entry.descriptor.webhook && (
            <div className="text-13 text-black-300">
              <p className="text-11 font-bold uppercase tracking-wider text-black-500 mb-1">
                Webhook registration
              </p>
              <p>
                Register{" "}
                <span className="font-mono text-black-100">
                  {entry.descriptor.webhook.urlPath}
                </span>{" "}
                in the provider dashboard. {entry.descriptor.webhook.notes}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <Link
              href={`/dashboard/integrations/${entry.descriptor.id}`}
              className="text-13 font-semibold text-purple-400 hover:text-purple-300"
            >
              Open workspace detail &amp; Test Connection →
            </Link>
            {entry.descriptor.docsUrl && (
              <a
                href={entry.descriptor.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-13 font-semibold text-black-300 hover:text-white"
              >
                Official docs <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ))}

      {children}
    </div>
  );
}
