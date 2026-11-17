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

interface AdminN8nStats {
  mode: string;
  n8nEnabled: boolean;
  baseUrl: string | null;
  /** null = unknown (migration 023 tables could not be read). */
  grantCount: number | null;
  /** Why the grant count is what it is (fallback to `other` until Worker B lands the n8n branch). */
  grantCountNote?: string;
  /** Active grants split by client origin; null = unknown. */
  grantsByOrigin?: { muse: number; chatgpt: number; claude: number; zapier: number; n8n?: number; other: number; total: number } | null;
  /** null = unknown (migration 028 tables could not be read). Counts only — never key rows or hashes. */
  apiKeyCounts: { total: number; active: number; revoked: number } | null;
  /** null = unknown (migration 029 tables could not be read). */
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
 * Live admin panels for the n8n connector (GET /api/admin/n8n,
 * behind resolveAdminGate). Grant count, API-key counts (counts
 * only — no hashes, no key rows), active webhook subscriptions,
 * delivery counts + recent failed/dead deliveries, n8n API-call
 * counts from the audit log, and recent n8n errors — metadata
 * only, never token/secret/key material (the per-subscription
 * HMAC secret is never selected by the API).
 */
function AdminN8nPanels() {
  const { data, error, loading, reload } = useAdminFetch<AdminN8nStats>(
    "/api/admin/n8n"
  );

  if (loading) return <LoadingState label="Loading n8n stats…" />;
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
            <dt className="text-12 text-black-400">n8n REST surface</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.n8nEnabled ? "Enabled" : "Disabled"}
            </dd>
            <dd className="text-12 text-black-400 break-all mt-0.5">
              {data.baseUrl ?? "No public URL set"}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Active n8n grants (platform-wide)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.grantCount === null ? "Unknown" : String(data.grantCount)}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.grantCountNote ??
                (data.grantCount === null
                  ? "Migration 023 tables could not be read."
                  : "Distinct client + user pairs with a live refresh token.")}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">API keys (platform-wide, counts only)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.apiKeyCounts === null
                ? "Unknown"
                : `${data.apiKeyCounts.active} active · ${data.apiKeyCounts.revoked} revoked · ${data.apiKeyCounts.total} total`}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.apiKeyCounts === null
                ? "Migration 028 tables could not be read."
                : "Key values and hashes are never shown here — counts only."}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">Active webhook subscriptions</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">
              {data.subscriptionCount === null ? "Unknown" : String(data.subscriptionCount)}
            </dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.subscriptionCount === null
                ? "Migration 029 tables could not be read."
                : "Active n8n webhook subscriptions across all workspaces."}
            </dd>
          </div>
          <div>
            <dt className="text-12 text-black-400">n8n API calls (audit log, latest 1,000 n8n entries)</dt>
            <dd className="text-14 font-semibold text-white mt-0.5">{totalCalls}</dd>
            <dd className="text-12 text-black-400 mt-0.5">
              {data.apiCallCounts.length === 0
                ? "No n8n API calls recorded yet."
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
          Active grants split by the client that holds them — Muse, ChatGPT, Claude, Zapier, n8n,
          or Other. The n8n count is what lets the n8n Integration Center entry show
          &ldquo;Connected&rdquo; only for a real n8n grant. Until the grants-by-origin n8n branch
          lands, n8n grants are counted under Other (see the grant-count note above).
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
                ["n8n", data.grantsByOrigin.n8n ?? data.grantsByOrigin.other],
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
          Webhook subscriptions created from n8n (NxtSend Trigger node). The per-subscription HMAC
          secret is never shown here (it is generated server-side and never returned by any
          endpoint). Delivery payloads are not shown either — they can contain lead data.
        </p>
        {data.subscriptions === null ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — the shared webhook tables could not be read (migration 029 platform
            discriminator not applied?). Apply
            supabase/migrations/029_n8n_webhook_platform.sql to this project.
          </p>
        ) : data.subscriptions.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No active n8n webhook subscriptions. Subscriptions appear here once an n8n user
            activates a workflow with a webhook-mode NxtSend Trigger.
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
          the daily 06:00 cron retry. A 410 from n8n deactivates the subscription (the workflow /
          webhook is gone).
        </p>
        {data.recentFailures === null ? (
          <p className="text-13 text-black-300 leading-relaxed">
            Unknown — the shared webhook tables could not be read (migration 029 not applied?).
          </p>
        ) : data.recentFailures.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No failed or dead n8n deliveries in the recent outbox rows.
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
        <h2 className="text-16 font-bold text-white">n8n API-call counts</h2>
        {data.apiCallCounts.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No n8n API calls in the audit log yet. Calls appear here once an n8n grant or API key is used.
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
        <h2 className="text-16 font-bold text-white">Recent n8n errors</h2>
        <p className="text-12 text-black-400 leading-relaxed">
          n8n audit entries whose detail mentions a failure, error, denial or refusal. This is
          a text match over audit details — audit rows carry no structured error flag.
        </p>
        {data.recentErrors.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No n8n errors in the recent audit entries.
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
        <h2 className="text-16 font-bold text-white">Recent n8n events</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-13 text-black-300 leading-relaxed">
            No n8n audit entries yet.
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
 * Admin → Integrations → n8n Integration.
 *
 * The n8n path is IMPLEMENTED in this codebase: NxtSend is the
 * server — it exposes a REST API (src/app/api/integrations/n8n/v1/)
 * + webhook triggers (migration 029) + scoped API keys (migration
 * 028) behind the shared OAuth 2.0 server (migration 023), and a
 * community node package (integrations/n8n-nodes-nxtsend/) that n8n
 * calls into. The node package has NOT been published on npm and is
 * NOT verified by n8n, so it does not appear in n8n's community-node
 * directory. This page must never show a connection without a real
 * OAuth grant, a recently-used API key, or an active webhook
 * subscription, and the live panels below show the real
 * grant/key/subscription/delivery counts (or honest unknowns).
 */
export default function AdminN8nPage() {
  return (
    <AdminIntegrationView
      title="n8n Integration"
      description="Connection between NxtSend and n8n. The REST API + webhook surface (OAuth 2.0, n8n.read / n8n.write, plus scoped API keys) is implemented — but the n8n-nodes-nxtsend package has not been published on npm and is not verified by n8n. A 'Connected' status comes only from a real OAuth grant, a recently-used API key, or an active webhook subscription, never from configuration alone."
      integrationIds={["n8n"]}
    >
      <AdminN8nPanels />
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What the owner must obtain</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            An n8n instance (self-hosted or n8n Cloud) and the community node installed there:
            Settings → Community Nodes → n8n-nodes-nxtsend. The package is NOT on npm yet, so
            until it is published install it from the repo path (integrations/n8n-nodes-nxtsend/)
            — see docs/n8n-integration/N8N_SETUP.md. Restart n8n after installing a community node.
          </li>
          <li>
            A credential for the node: either an API key created on the{" "}
            <Link
              href="/dashboard/integrations/n8n"
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              n8n Integration Center page
            </Link>{" "}
            (shown exactly once — store it in n8n immediately), or an OAuth2 client registered
            with the one-time Dynamic Client Registration call (exact curl in
            docs/n8n-integration/API_AUTHENTICATION.md). There is no N8N_API_KEY or
            N8N_OAUTH_CLIENT_SECRET env var — keys are generated in-app, never in env.
          </li>
          <li>
            A decision on publication: the surface is implemented (REST API v1, webhooks,
            API keys, migrations 028–029); publishing the node on npm and then submitting it
            for n8n community-node verification is still an owner step, and has not been done.
          </li>
          <li>
            LinkedIn-send actions stay unsupported: no authorized LinkedIn provider exists, and
            the official LinkedIn API exposes no connection-request/DM endpoints to standard
            developers.
          </li>
          <li>
            n8n grants are listed in the same overview above (&ldquo;Grants by client
            origin&rdquo;) and on the{" "}
            <Link
              href="/dashboard/integrations/n8n"
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              n8n Integration Center page
            </Link>{" "}
            — the n8n REST surface shares the same OAuth tables (migrations 023 + 028/029)
            as the Muse/ChatGPT/Claude/Zapier connectors.
          </li>
        </ul>
      </div>
    </AdminIntegrationView>
  );
}
