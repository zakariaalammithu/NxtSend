"use client";

/**
 * Provider monitoring — per-provider detail (Wave 2, Phase 2,
 * super-admin only).
 *
 * GET /api/admin/integrations/monitoring/[provider]: the same
 * monitoring scoped to one provider, plus its stored connections,
 * audit-log entries, webhook deliveries and sync history. Every
 * section has an honest empty state ("No errors recorded",
 * "No syncs yet") where nothing is recorded. The disable switch
 * lives here; its enforcement scope is stated on the page, not
 * overstated.
 */

import * as React from "react";
import Link from "next/link";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import {
  DisableToggle,
  ProviderHealthBadge,
  fmtUnknown,
  type MonitoringDetailResponse,
} from "../monitoring-ui";

export default function ProviderMonitoringDetailPage({
  params,
}: {
  params: { provider: string };
}) {
  const providerId = params.provider;
  const url = `/api/admin/integrations/monitoring/${encodeURIComponent(providerId)}`;
  const { data, error, loading, reload } = useAdminFetch<MonitoringDetailResponse>(
    url,
    [url]
  );

  if (loading) return <LoadingState label="Loading provider monitoring…" />;
  if (error || !data?.provider) {
    return (
      <div>
        <BackLink />
        <ErrorState message={error ?? "Provider not found."} onRetry={reload} />
      </div>
    );
  }

  const row = data.provider;

  return (
    <div className="space-y-6 pb-14">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <AdminPageHeader
            title={row.name}
            description={`${row.category} · ${row.authType} · ${row.id}`}
          />
          <div className="mt-2">
            <ProviderHealthBadge row={row} />
          </div>
        </div>
        <div className="glass-card p-4">
          <DisableToggle
            providerId={row.id}
            providerName={row.name}
            disabled={row.disabled}
            reason={row.disabledReason}
            onChanged={reload}
          />
          <p className="mt-2 max-w-72 text-11 leading-relaxed text-black-400">
            Enforcement: the flag is checked by{" "}
            <span className="font-mono">assertProviderEnabled()</span> in
            the shared REST auth gate. A disabled automation platform
            (Zapier, n8n, Make, Pabbly, Albato, Activepieces) refuses
            every REST API call with an honest 503. Other providers&apos;
            flags are recorded and shown here, but their connect flow
            is not yet gated. Disabling never deletes an existing
            stored connection.
          </p>
          {row.disabled && (
            <p className="mt-1 text-11 text-black-400">
              Disabled {row.disabledAt ? fmtDateTime(row.disabledAt) : "at an unknown time"}
              {row.disabledBy ? ` by ${row.disabledBy}` : ""}.
            </p>
          )}
        </div>
      </div>

      {data.note && <p className="text-13 text-black-300">{data.note}</p>}
      {row.auditNote && (
        <p className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13 text-black-300">
          {row.auditNote}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Connected workspaces" value={`${row.connectedWorkspaces} of ${row.connectionCount} stored`} />
        <Stat
          label="API calls 24h / 7d"
          value={
            row.auditTracked
              ? `${fmtUnknown(row.apiCalls24h)} / ${fmtUnknown(row.apiCalls7d)}`
              : "Not recorded"
          }
        />
        <Stat
          label="API errors 24h / 7d"
          value={
            row.auditTracked
              ? `${fmtUnknown(row.apiErrors24h)} / ${fmtUnknown(row.apiErrors7d)}`
              : "Not recorded"
          }
        />
        <Stat
          label="Webhook deliveries"
          value={
            row.webhookTracked
              ? row.deliveryCounts
                ? `${row.deliveryCounts.delivered} delivered · ${row.deliveryCounts.failed} failed · ${row.deliveryCounts.dead} dead`
                : "Unknown"
              : "Not recorded"
          }
        />
        <Stat
          label="Sync jobs 7d"
          value={
            row.syncJobs7d
              ? `${row.syncJobs7d.total} total · ${row.syncJobs7d.completed} completed · ${row.syncJobs7d.failed} failed`
              : "Unknown"
          }
        />
        <Stat
          label="Usage 7d"
          value={
            row.usage7d
              ? `${row.usage7d.events} events · ${row.usage7d.credits} credits`
              : "Unknown"
          }
        />
        <Stat label="Last sync" value={row.lastSyncAt ? fmtDateTime(row.lastSyncAt) : "No syncs yet"} />
        <Stat label="Last error" value={row.lastError ?? "No errors recorded"} />
      </dl>

      <Section title="Stored connections" count={data.connections.length}>
        {data.connections.length === 0 ? (
          <EmptyStateBox
            title="No stored connections"
            message="No workspace has a stored connection for this provider."
          />
        ) : (
          <ul className="space-y-2">
            {data.connections.map((c) => (
              <li
                key={`${c.workspaceId}-${c.status}`}
                className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13"
              >
                <span className="font-mono text-12 text-black-300">{c.workspaceId}</span>
                {" · "}
                <span className="font-semibold text-white">{c.status}</span>
                {c.lastSyncAt && (
                  <span className="text-black-400"> · last sync {fmtDateTime(c.lastSyncAt)}</span>
                )}
                {c.lastError && (
                  <p className="mt-1 text-12 text-rose-300">{c.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Audit-log entries" count={data.audit.length}>
        {data.audit.length === 0 ? (
          <EmptyStateBox
            title="No audit entries recorded"
            message={
              row.auditTracked
                ? "No audit entries for this provider in the recent window."
                : "This provider does not write audit-log entries."
            }
          />
        ) : (
          <ul className="space-y-2">
            {data.audit.map((e, i) => (
              <li
                key={`${e.action}-${e.createdAt}-${i}`}
                className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13"
              >
                <span className="font-mono text-12 text-white">{e.action}</span>
                <span className="text-black-400"> · {fmtDateTime(e.createdAt)}</span>
                {e.details && <p className="mt-1 text-12 text-black-300">{e.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Webhook deliveries" count={data.deliveries.length}>
        {data.deliveries.length === 0 ? (
          <EmptyStateBox
            title="No webhook deliveries recorded"
            message={
              row.webhookTracked
                ? "No webhook deliveries for this provider in the recent window."
                : "This provider has no webhook outbox — deliveries are tracked only for the six REST platforms."
            }
          />
        ) : (
          <ul className="space-y-2">
            {data.deliveries.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13"
              >
                <span className="font-mono text-12 text-white">{d.event}</span>
                {" · "}
                <span className="font-semibold text-white">{d.status}</span>
                <span className="text-black-400">
                  {" "}· {d.attempts}/{d.maxAttempts} attempts · {fmtDateTime(d.createdAt)}
                </span>
                {d.lastError && <p className="mt-1 text-12 text-rose-300">{d.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sync history (7d)" count={data.syncJobs.length}>
        {data.syncJobs.length === 0 ? (
          <EmptyStateBox
            title="No syncs yet"
            message="No sync job has been recorded for this provider in the last 7 days."
          />
        ) : (
          <ul className="space-y-2">
            {data.syncJobs.map((j) => (
              <li
                key={j.id}
                className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13"
              >
                <span className="font-semibold text-white">{j.status}</span>
                <span className="text-black-400">
                  {" "}· {j.direction} · {fmtDateTime(j.createdAt)}
                </span>
                <p className="mt-1 text-12 text-black-300">
                  {j.processed} processed · {j.created} created · {j.updated}{" "}
                  updated · {j.skipped} skipped · {j.failed} failed
                </p>
                {j.errors.length > 0 && (
                  <p className="mt-1 text-12 text-rose-300">{j.errors.join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Usage events (7d)" count={data.usage.length}>
        {data.usage.length === 0 ? (
          <EmptyStateBox
            title="No usage recorded"
            message="No billable usage event has been recorded for this provider in the last 7 days."
          />
        ) : (
          <ul className="space-y-2">
            {data.usage.map((u, i) => (
              <li
                key={`${u.event}-${u.recordedAt}-${i}`}
                className="rounded-xl border border-black-700/60 bg-black-800/60 px-4 py-3 text-13"
              >
                <span className="font-mono text-12 text-white">{u.event}</span>
                <span className="text-black-400">
                  {" "}· {u.creditsUsed} credits · {fmtDateTime(u.recordedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {row.capabilities.length > 0 && (
        <section className="glass-card p-6">
          <h2 className="text-16 font-bold text-white">What this provider offers</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-13 text-black-300">
            {row.capabilities.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {row.docsUrl && (
            <a
              href={row.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-13 text-white underline underline-offset-2"
            >
              Provider documentation
            </a>
          )}
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/integrations/monitoring"
      className="mb-4 inline-flex items-center gap-1.5 text-13 text-black-400 transition-colors hover:text-white"
    >
      ← Provider monitoring
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <dt className="text-12 text-black-400">{label}</dt>
      <dd className="mt-0.5 text-14 font-semibold break-words text-white">{value}</dd>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-16 font-bold text-white">
        {title}{" "}
        <span className="rounded-full bg-black-700 px-2 py-0.5 text-11 text-black-300">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}
