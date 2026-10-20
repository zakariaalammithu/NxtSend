"use client";

/**
 * Admin → System → Deliverability (P5 Stage D).
 *
 * The platform's email-deliverability monitoring surface, fed by
 * GET /api/admin/deliverability — the service-role read path over
 * the provider webhook log (`email_events`). Everything shown is an
 * aggregate or a row of real recorded data:
 *   - the delivery funnel + rates (provider-confirmed in live mode;
 *     SIMULATED and labelled as such in demo mode),
 *   - the inbound webhook log, including email.received deliveries
 *     that could not be routed to any workspace (unrouted mail was
 *     invisible in every UI before this page),
 *   - sending errors (messages carrying provider error text),
 *   - reply sync status, derived from real event recency — it says
 *     "No inbound events recorded yet" when that is the truth and
 *     never claims the pipeline is "Healthy".
 */

import * as React from "react";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type {
  DeliverabilityAggregate,
  ReplySyncStatus,
} from "@/lib/email/events-core";
import type {
  AdminWebhookLogEntry,
  SendingErrorRow,
} from "@/lib/email/deliverability-server";

interface WarmupConfigResponse {
  mode: string;
  providerLabel: string;
  configured: boolean;
  state: string;
  stateLabel: string;
  envVar: string;
  lastVerification: {
    ok: boolean;
    checkedAt: string;
    message: string;
    workspaceId: string;
  } | null;
}

/**
 * Warm-up Configuration (P5 Stage E) — configuration facts only:
 * provider, credential-configured boolean, derived state, and the last
 * recorded Test Connection outcome. No secret value can appear here
 * (the API returns presence/state only). Warm-up activity itself runs
 * on the provider's network; per-mailbox status is the workspace
 * surface at Email → Warm-up.
 */
function WarmupConfigCard() {
  const { data, loading } = useAdminFetch<WarmupConfigResponse>(
    "/api/admin/warmup",
    []
  );
  return (
    <div className="glass-card p-6 space-y-3" data-testid="admin-warmup-config">
      <h2 className="text-16 font-bold text-white">Warm-up Configuration</h2>
      {loading && <p className="text-13 text-black-400">Loading…</p>}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-13">
            <div>
              <p className="text-black-500 text-12">Provider</p>
              <p className="text-white mt-0.5">
                {data.providerLabel} (external — warm-up runs on the
                provider&apos;s network)
              </p>
            </div>
            <div>
              <p className="text-black-500 text-12">
                Credential configured ({data.envVar})
              </p>
              <p className="text-white mt-0.5">
                {data.configured ? "Yes" : "No"}
              </p>
            </div>
            <div>
              <p className="text-black-500 text-12">State</p>
              <p className="text-white mt-0.5">{data.stateLabel}</p>
            </div>
          </div>
          <p className="text-13 text-black-300">
            {data.lastVerification
              ? `Last Test Connection ${data.lastVerification.ok ? "succeeded" : "FAILED"} ${fmtDateTime(data.lastVerification.checkedAt)}: ${data.lastVerification.message}`
              : "No Test Connection has been recorded for the warm-up provider yet. Until one succeeds, warm-up status reads Unavailable — key presence alone never counts as verified."}
          </p>
          <p className="text-12 text-black-500">
            Only presence and state are shown — the API key value is never
            rendered anywhere in admin. Per-mailbox warm-up status (as
            reported by the provider) lives in the workspace under Email →
            Warm-up.
          </p>
        </>
      )}
    </div>
  );
}

interface DeliverabilityResponse {
  mode: string;
  classification: "provider" | "simulated";
  days: number;
  totals: DeliverabilityAggregate;
  webhookLog: AdminWebhookLogEntry[];
  sendingErrors: SendingErrorRow[];
  replySync: ReplySyncStatus;
}

const DAY_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
];

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function FunnelCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="glass-card p-5">
      <p className="text-12 font-medium text-black-400">{label}</p>
      <p className="text-28 font-bold text-white mt-1">{value}</p>
      <p className="text-12 text-black-500 mt-1">{sub}</p>
    </div>
  );
}

const ROUTING_BADGE: Record<string, { label: string; cls: string }> = {
  routed: { label: "Routed", cls: "bg-emerald-500/15 text-emerald-400" },
  unrouted: { label: "Unrouted", cls: "bg-amber-500/15 text-amber-400" },
  linked: { label: "Linked", cls: "bg-black-700 text-black-300" },
  unmatched: { label: "Unmatched", cls: "bg-rose-500/15 text-rose-400" },
};

export default function AdminDeliverabilityPage() {
  const [days, setDays] = React.useState(30);
  const { data, error, loading, reload } =
    useAdminFetch<DeliverabilityResponse>(
      `/api/admin/deliverability?days=${days}`,
      [days]
    );

  const counts = data?.totals.counts;
  const rates = data?.totals.rates;
  const simulated = data?.classification === "simulated";

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Deliverability"
        description="Email delivery funnel, inbound webhook log, sending errors and reply sync — aggregated from the provider's recorded webhook events. Rates are computed only from real events; nothing here is estimated."
      />

      {data && <ModeNote mode={data.mode} />}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="deliv-days" className="text-13 text-black-300">
          Window
        </label>
        <select
          id="deliv-days"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
        >
          {DAY_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>
        {simulated && (
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-11 font-semibold bg-amber-500/15 text-amber-400">
            Simulated data — Demo Mode derivation, not provider events
          </span>
        )}
        {data && !simulated && (
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-11 font-semibold bg-emerald-500/15 text-emerald-400">
            Provider-confirmed events
          </span>
        )}
      </div>

      {loading && <LoadingState label="Loading deliverability…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && counts && rates && (
        <>
          {/* Funnel */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <FunnelCard
              label="Sent"
              value={String(counts.sent)}
              sub={simulated ? "Simulated sends" : "Accepted by the provider"}
            />
            <FunnelCard
              label="Delivered"
              value={String(counts.delivered)}
              sub={`Delivery rate ${pct(rates.deliveryRate)}`}
            />
            <FunnelCard
              label="Bounced"
              value={String(counts.bounced)}
              sub={`Bounce rate ${pct(rates.bounceRate)}`}
            />
            <FunnelCard
              label="Complained"
              value={String(counts.complained)}
              sub={`Complaint rate ${pct(rates.complaintRate)}`}
            />
            <FunnelCard
              label="Opened"
              value={String(counts.opened)}
              sub={`Open rate ${pct(rates.openRate)} of delivered`}
            />
            <FunnelCard
              label="Clicked"
              value={String(counts.clicked)}
              sub={`Click rate ${pct(rates.clickRate)} of delivered`}
            />
          </div>
          {data.totals.eventCount === 0 && (
            <EmptyStateBox
              title="No email events in this window"
              message="No provider webhook events were recorded in the selected period, so the funnel is empty. Widen the window, or check that the Resend webhook is configured (deliveries are only recorded after signature verification)."
            />
          )}

          {/* Reply sync status */}
          <div className="glass-card p-6 space-y-3">
            <h2 className="text-16 font-bold text-white">Reply Sync Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-13">
              <div>
                <p className="text-black-500 text-12">Webhook secret configured</p>
                <p className="text-white mt-0.5">
                  {data.replySync.webhookSecretConfigured ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-black-500 text-12">Last inbound event</p>
                <p className="text-white mt-0.5">
                  {data.replySync.lastInboundAt
                    ? fmtDateTime(data.replySync.lastInboundAt)
                    : "None recorded"}
                </p>
              </div>
              <div>
                <p className="text-black-500 text-12">Last event of any type</p>
                <p className="text-white mt-0.5">
                  {data.replySync.lastEventAt
                    ? fmtDateTime(data.replySync.lastEventAt)
                    : "None recorded"}
                </p>
              </div>
            </div>
            <p className="text-13 text-black-300">{data.replySync.message}</p>
            <p className="text-12 text-black-500">
              Status is derived from the recorded events themselves — it is
              never a blanket &ldquo;Healthy&rdquo;: an empty or stale log says so.
            </p>
          </div>

          {/* Warm-up configuration */}
          <WarmupConfigCard />

          {/* Inbound webhook log */}
          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-1">
              Inbound Webhook Log
            </h2>
            <p className="text-13 text-black-400 mb-4">
              The most recent recorded provider events.{" "}
              <span className="text-amber-300">Unrouted</span> received mail
              matched no conversation or lead in any workspace — it was
              recorded, never guessed into a tenant.
            </p>
            {data.webhookLog.length === 0 ? (
              <EmptyStateBox
                title="No events recorded in this window"
                message="Verified webhook deliveries will appear here as they arrive."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="text-left text-black-500 border-b border-black-700">
                      <th className="py-2 pr-3 font-medium">Received</th>
                      <th className="py-2 pr-3 font-medium">Event</th>
                      <th className="py-2 pr-3 font-medium">Routing</th>
                      <th className="py-2 pr-3 font-medium">Workspace</th>
                      <th className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black-800">
                    {data.webhookLog.map((entry) => {
                      const badge = ROUTING_BADGE[entry.routing] ?? ROUTING_BADGE.unmatched;
                      return (
                        <tr key={entry.id} className="text-black-200">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {fmtDateTime(entry.received_at)}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {entry.event_type}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-11 font-semibold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {entry.workspace_name ?? "—"}
                          </td>
                          <td className="py-2 text-black-400">
                            {entry.detail ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sending errors */}
          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-1">Sending Errors</h2>
            <p className="text-13 text-black-400 mb-4">
              Messages whose send failed, with the provider&apos;s stored
              error text — newest first.
            </p>
            {data.sendingErrors.length === 0 ? (
              <EmptyStateBox
                title="No sending errors recorded"
                message="No message in any workspace currently carries a send error. Failed sends will appear here with the provider's error text."
              />
            ) : (
              <div className="space-y-3">
                {data.sendingErrors.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl bg-black-800/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-13 font-medium text-white">
                        {row.subject || "(no subject)"}
                      </span>
                      <span className="inline-flex rounded-full px-2 py-0.5 text-11 font-semibold bg-rose-500/15 text-rose-400">
                        {row.status}
                      </span>
                      <span className="text-12 text-black-500">
                        {fmtDateTime(row.sent_at)}
                      </span>
                    </div>
                    <p className="text-12 text-black-400 mt-1">
                      {row.workspace_name ?? "Unknown workspace"}
                      {row.recipient ? ` · to ${row.recipient}` : ""}
                    </p>
                    {row.error && (
                      <p className="text-12 text-rose-300 mt-1">{row.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
