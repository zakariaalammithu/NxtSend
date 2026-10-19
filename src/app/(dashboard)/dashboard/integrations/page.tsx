"use client";

import * as React from "react";
import Link from "next/link";
import {
  Puzzle,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import WebhookSettings from "@/components/dashboard/WebhookSettings";
import {
  INTEGRATION_ICONS,
  STATUS_BADGE_VARIANT,
} from "@/components/dashboard/IntegrationCenterBits";
import type { IntegrationStatusEntry } from "@/lib/integrations-center/types";

/**
 * Integration Center hub.
 *
 * Every card's status comes from GET /api/integrations/status, which
 * derives it server-side from the actual environment/configuration —
 * nothing on this page is hardcoded. Statuses use the exact Center
 * vocabulary; "Connected and Verified" appears only after a real
 * verification call has succeeded (Test Connection on the detail page).
 */

interface StatusResponse {
  mode: "demo" | "supabase";
  integrations: IntegrationStatusEntry[];
}

export default function IntegrationsPage() {
  const [data, setData] = React.useState<StatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/integrations/status")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Status request failed (HTTP ${res.status})`);
        }
        return (await res.json()) as StatusResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load integration statuses.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const categories = React.useMemo(() => {
    const order: string[] = [];
    const grouped = new Map<string, IntegrationStatusEntry[]>();
    for (const entry of data?.integrations ?? []) {
      const cat = entry.descriptor.category;
      if (!grouped.has(cat)) {
        grouped.set(cat, []);
        order.push(cat);
      }
      grouped.get(cat)?.push(entry);
    }
    return order.map((cat) => ({ category: cat, entries: grouped.get(cat) ?? [] }));
  }, [data]);

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="External Integrations" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Integration Center
          </h1>
          {data?.mode === "demo" && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Every status below is derived from the actual server configuration —
          an integration shows <strong className="text-white">Connected and Verified</strong> only
          after a real Test Connection succeeds on its detail page.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-2">
            <p className="text-13 text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-lg bg-rose-600/20 border border-rose-500/30 px-3 py-1.5 text-12 font-semibold text-rose-200 hover:bg-rose-600/40 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-11 w-11 rounded-2xl bg-black-700 mb-4" />
              <div className="h-4 w-2/3 rounded bg-black-700 mb-2" />
              <div className="h-3 w-full rounded bg-black-800" />
            </div>
          ))}
        </div>
      )}

      {categories.map(({ category, entries }) => (
        <section key={category} className="space-y-4">
          <h2 className="text-13 font-semibold uppercase tracking-wider text-black-400">
            {category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entries.map((entry) => {
              const Icon = INTEGRATION_ICONS[entry.descriptor.id] ?? Puzzle;
              const configuredCount = entry.envPresence.filter((v) => v.present).length;
              return (
                <Link
                  key={entry.descriptor.id}
                  href={`/dashboard/integrations/${entry.descriptor.id}`}
                  className="glass-card p-6 flex flex-col justify-between transition-all hover:border-purple-500/50 group"
                >
                  <div>
                    <div className="flex items-start justify-between mb-4 gap-2">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-purple-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANT[entry.status]} size="sm">
                        {entry.status}
                      </Badge>
                    </div>
                    <h3 className="text-16 font-bold text-white mb-1.5">
                      {entry.descriptor.name}
                    </h3>
                    <p className="text-13 text-black-300 leading-relaxed mb-3">
                      {entry.descriptor.tagline}
                    </p>
                    <p className="text-12 text-black-400 leading-relaxed">
                      {entry.statusMessage}
                    </p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-black-700/60 space-y-2">
                    {entry.envPresence.length > 0 && (
                      <div className="flex items-center justify-between text-11 text-black-400">
                        <span>Configuration:</span>
                        <span className="font-medium text-black-300">
                          {configuredCount}/{entry.envPresence.length} variables set
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-11 text-black-400">
                      <span>Last verification:</span>
                      <span className="font-medium text-black-300 inline-flex items-center gap-1">
                        {entry.lastVerification ? (
                          entry.lastVerification.ok ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-green-400" />
                              Passed
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 text-rose-400" />
                              Failed
                            </>
                          )
                        ) : (
                          "Never"
                        )}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-13 font-semibold text-purple-300 group-hover:text-white transition-colors pt-1">
                      Details, setup &amp; Test Connection
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* Outbound webhooks — real settings surface (state from the API) */}
      <div id="webhook-settings">
        <WebhookSettings />
      </div>
    </div>
  );
}
