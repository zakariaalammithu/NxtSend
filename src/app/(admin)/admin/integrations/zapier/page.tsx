"use client";

import * as React from "react";
import Link from "next/link";
import { AdminIntegrationView } from "@/components/admin/AdminIntegrationView";
import {
  ErrorState,
  LoadingState,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";

interface AdminZapierStats {
  mode: string;
  zapierEnabled: boolean;
  baseUrl: string | null;
  /** null = unknown (migration 023 tables could not be read). */
  grantCount: number | null;
  /** Active grants split by client origin; null = unknown. */
  grantsByOrigin?: { muse: number; chatgpt: number; claude: number; zapier: number; other: number; total: number } | null;
  /** null = unknown (migration 025 tables could not be read). */
  subscriptions: {
    id: string;
    workspace_id: string;
    event: string;
    target_url: string;
    active: boolean;
    created_at: string;
    updated_at: string;
  }[] | null;
  subscriptionCount: number | null;
  subscriptionsByEvent: Record<string, number> | null;
  deliveryCounts: { pending: number; delivered: number; failed: number; dead: number } | null;
  recentFailures: {
    id: string;
    event: string;
    subscription_id: string;
    status: string;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    next_retry_at: string | null;
    created_at: string;
  }[] | null;
  apiCallCounts: { action: string; calls: number }[];
  recentErrors: { action: string; resource: string | null; details: string; created_at: string }[];
  recentEvents: { action: string; resource: string | null; details: string; created_at: string }[];
  note?: string;
}

/**
 * Live admin panels for the Zapier connector (GET /api/admin/zapier,
 * behind resolveAdminGate). Grant count, active webhook subscriptions,
 * delivery counts + recent failed/dead deliveries, Zapier API-call
 * counts from the audit log, and recent Zapier errors — metadata
 * only, never token/secret material (the per-subscription HMAC
 * secret is never selected by the API).
 */
function AdminZapierPanels() {
  const { data, error, loading, reload } = useAdminFetch<AdminZapierStats>(
    "/api/admin/zapier"
  );

  if (loading) return <LoadingState label="Loading Zapier stats…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const totalCalls = data.apiCallCounts.reduce((sum, t) => sum + t.calls, 0);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Live overview</h2>
        {data.note && <p className="text-13 text-black-300 leading-relaxed">{data.note}</p>}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <dt className="text-12 text-black-400">Zapier REST surface</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.zapierEnabled ? "Enabled" : "Disabled"}
            </dd>
            <dd className="text-12 text-black-400 break-all mt-0.5">
              {data.baseUrl ?? "No public URL set"}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Active Zapier grants (platform-wide)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.grantCount === null ? "Unknown" : String(data.grantCount)}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.grantCount === null
                ? "Migration 023 tables could not be read."
                : "Distinct client + user pairs with a live refresh token."}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Active webhook subscriptions</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.subscriptionCount === null ? "Unknown" : String(data.subscriptionCount)}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.subscriptionCount === null
                ? "Migration 025 tables could not be read."
                : "Active REST Hook subscriptions across all workspaces."}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Zapier API calls (audit log, latest 1,000 Zapier entries)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">{totalCalls}</dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.apiCallCounts.length === 0
                ? "No Zapier API calls recorded yet."
                : `${data.apiCallCounts.length} action(s) used.`}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Deliveries (latest 1,000)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.deliveryCounts === null
                ? "Unknown"
                : `${data.deliveryCounts.delivered} delivered · ${data.deliveryCounts.failed} failed · ${data.deliveryCounts.dead} dead · ${data.deliveryCounts.pending} pending`}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              Failed deliveries retry on the daily 06:00 cron (max 3 attempts, then dead) — a failed
              delivery may wait up to ~24h for its next retry.
            </dd>
          </div>
        </dl>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Grants by client origin</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          Active grants split by the client that holds them — Muse, ChatGPT, Claude, Zapier, or
          Other. The Zapier count is what lets the Zapier Integration Center entry show
          &ldquo;Connected&rdquo; only for a real Zapier grant.
        </p>
        {!data.grantsByOrigin ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — migration 023 tables could not be read.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            {(
              [
                ["Muse", data.grantsByOrigin.muse],
                ["ChatGPT", data.grantsByOrigin.chatgpt],
                ["Claude", data.grantsByOrigin.claude],
                ["Zapier", data.grantsByOrigin.zapier],
                ["Other", data.grantsByOrigin.other],
                ["Total", data.grantsByOrigin.total],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <dt className="text-12 text-black-400">{label}</dt>
                <dd className="text-14 font-semibold text-white mt-0.5">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Active webhook subscriptions</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          REST Hook subscriptions created from Zapier. The per-subscription HMAC secret is never
          shown here (it is generated server-side and never returned by any endpoint). Delivery
          payloads are not shown either — they can contain lead data.
        </p>
        {data.subscriptions === null ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — migration 025 tables could not be read. Apply
            supabase/migrations/025_zapier_webhooks.sql to this project.
          </p>
        ) : data.subscriptions.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No active Zapier webhook subscriptions. Subscriptions appear here once a Zapier user
            enables an instant trigger.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.subscriptionsByEvent &&
              Object.entries(data.subscriptionsByEvent).map(([event, count]) => (
                <div key={event} className="flex items-center justify-between gap-3 py-2">
                  <code className="font-mono text-13 text-white">{event}</code>
                  <span className="text-13 font-semibold text-black-200">{count}</span>
                </div>
              ))}
            {data.subscriptions.slice(0, 20).map((s) => (
              <div key={s.id} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{s.event}</code>
                  <span className="font-mono text-11 text-black-400 break-all">{s.target_url}</span>
                  <span className="text-11 text-black-500">{fmtDateTime(s.created_at)}</span>
                </div>
                <p className="text-11 text-black-500 font-mono break-all">
                  {s.id} · workspace {s.workspace_id}
                </p>
              </div>
            ))}
            {data.subscriptions.length > 20 && (
              <p className="text-12 text-black-400 pt-2">
                Showing 20 of {data.subscriptions.length} active subscriptions.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Recent failed / dead deliveries</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          Deliveries that failed their immediate attempt and are waiting on (or have exhausted)
          the daily 06:00 cron retry. A 410 from Zapier deactivates the subscription (the Zap is
          gone).
        </p>
        {data.recentFailures === null ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — migration 025 tables could not be read.
          </p>
        ) : data.recentFailures.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No failed or dead Zapier deliveries in the recent outbox rows.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.recentFailures.map((d) => (
              <div key={d.id} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{d.event}</code>
                  <span className="text-11 font-semibold text-rose-300">{d.status}</span>
                  <span className="text-11 text-black-400">
                    {d.attempts}/{d.max_attempts} attempts
                  </span>
                  <span className="text-11 text-black-500">{fmtDateTime(d.created_at)}</span>
                </div>
                {d.last_error && (
                  <p className="text-12 text-black-300 leading-relaxed">{d.last_error}</p>
                )}
                {d.next_retry_at && (
                  <p className="text-11 text-black-500">Next retry: {fmtDateTime(d.next_retry_at)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Zapier API-call counts</h2>
        {data.apiCallCounts.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Zapier API calls in the audit log yet. Calls appear here once a Zapier grant is used.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.apiCallCounts.map((t) => (
              <div key={t.action} className="flex items-center justify-between gap-3 py-2">
                <code className="font-mono text-13 text-white">{t.action}</code>
                <span className="text-13 font-semibold text-black-200">{t.calls}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Recent Zapier errors</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          Zapier audit entries whose detail mentions a failure, error, denial or refusal. This is
          a text match over audit details — audit rows carry no structured error flag.
        </p>
        {data.recentErrors.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Zapier errors in the recent audit entries.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.recentErrors.map((e, i) => (
              <div key={`${e.created_at}-${e.action}-${i}`} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{e.action}</code>
                  {e.resource && (
                    <span className="font-mono text-11 text-black-400 break-all">{e.resource}</span>
                  )}
                  <span className="text-11 text-black-500">{fmtDateTime(e.created_at)}</span>
                </div>
                {e.details && <p className="text-12 text-black-300 leading-relaxed">{e.details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">Recent Zapier events</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No Zapier audit entries yet.
          </p>
        ) : (
          <div className="divide-y divide-black-700/60">
            {data.recentEvents.map((e, i) => (
              <div key={`${e.created_at}-${e.action}-${i}`} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{e.action}</code>
                  {e.resource && (
                    <span className="font-mono text-11 text-black-400 break-all">{e.resource}</span>
                  )}
                  <span className="text-11 text-black-500">{fmtDateTime(e.created_at)}</span>
                </div>
                {e.details && <p className="text-12 text-black-300 leading-relaxed">{e.details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Admin → Integrations → Zapier Integration.
 *
 * The Zapier path is IMPLEMENTED in this codebase: NxtSend is the
 * server — it exposes a REST API (src/app/api/integrations/zapier/v1/,
 * 30 routes) + REST Hook webhooks (migration 025) behind the shared
 * OAuth 2.0 server (migrations 023 + 026), and a Platform CLI app
 * (integrations/zapier/) that Zapier calls into. It has NOT been
 * published on Zapier and is NOT approved, so it does not appear in
 * Zapier's app directory. This page must never show a connection
 * without a real OAuth grant, and the live panels below show the
 * real grant/subscription/delivery counts (or honest unknowns).
 */
export default function AdminZapierPage() {
  return (
    <AdminIntegrationView
      title="Zapier Integration"
      description="Connection between NxtSend and Zapier. The REST API + REST Hook surface (OAuth 2.0, zapier.read / zapier.write) is implemented and testable in Zapier's developer platform — but it has not been published on Zapier and is not approved. A 'Connected' status comes only from a real OAuth grant, never from configuration alone."
      integrationIds={["zapier"]}
    >
      <AdminZapierPanels />
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What the owner must obtain</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            A Zapier developer account, and the app registered there: create the app, copy its
            exact OAuth Redirect URL, register the OAuth client with the one-time Dynamic Client
            Registration call (exact curl in docs/zapier-integration/ZAPIER_SERVER.md), and enter
            the returned client_id / client_secret (shown once) in the Zapier dashboard.{" "}
            <code className="font-mono text-black-200">zapier-platform register</code> writes{" "}
            <code className="font-mono text-black-200">.zapierapprc</code> — never commit it.
          </li>
          <li>
            A decision on publication: the surface is implemented (REST API v1, REST Hooks,
            migrations 025–027); publishing through Zapier&apos;s review (~1 week), then 90-day
            Beta, then Public — including a non-expiring test account for
            integration-testing@zapier.com and live Zaps with successful runs per
            trigger/action/search — is still an owner step, and has not been done.
          </li>
          <li>
            LinkedIn-send actions stay unsupported: no authorized LinkedIn provider exists, and
            the official LinkedIn API exposes no connection-request/DM endpoints to standard
            developers.
          </li>
          <li>
            Zapier grants are listed in the same overview above (&ldquo;Grants by client
            origin&rdquo;) and on the{" "}
            <Link
              href="/dashboard/integrations/zapier"
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              Zapier Integration Center page
            </Link>{" "}
            — the Zapier REST surface shares the same OAuth tables (migrations 023 + 024 + 026)
            as the Muse/ChatGPT/Claude connectors.
          </li>
        </ul>
      </div>
    </AdminIntegrationView>
  );
}
