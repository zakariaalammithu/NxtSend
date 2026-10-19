"use client";

import * as React from "react";
import { Bell, Shield, ListOrdered, Webhook } from "lucide-react";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { AdminNotification } from "@/lib/admin/notifications-core";

interface NotificationsResponse {
  mode: string;
  notifications: AdminNotification[];
}

const SOURCE_META = {
  audit: { label: "Audit log", Icon: Shield },
  jobs: { label: "Background jobs", Icon: ListOrdered },
  webhooks: { label: "Webhooks", Icon: Webhook },
} as const;

/**
 * Admin → Notifications. A DERIVED feed — nothing is stored here.
 * Items are merged at read time from three real sources (recent audit
 * entries, failed job runs, failed webhook deliveries), each labelled
 * with its source and severity so a signal can always be traced back.
 */
export default function AdminNotificationsPage() {
  const { data, error, loading, reload } = useAdminFetch<NotificationsResponse>(
    "/api/admin/notifications"
  );
  const [sourceFilter, setSourceFilter] = React.useState("all");

  const notifications = React.useMemo(() => {
    const all = data?.notifications ?? [];
    return sourceFilter === "all"
      ? all
      : all.filter((n) => n.source === sourceFilter);
  }, [data, sourceFilter]);

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Notifications"
        description="Platform signals derived from the audit log, failed job runs, and failed webhook deliveries. This feed stores nothing of its own — every item traces to its source record."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading notifications…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-black-400" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by source"
            >
              <option value="all">All sources</option>
              <option value="audit">Audit log</option>
              <option value="jobs">Background jobs</option>
              <option value="webhooks">Webhooks</option>
            </select>
          </div>

          {notifications.length === 0 ? (
            <EmptyStateBox
              title="No notifications"
              message="Nothing to report from the audit log, job queue, or webhook deliveries right now. Failures and security-relevant actions will appear here as they happen."
            />
          ) : (
            <div className="space-y-2.5">
              {notifications.map((n) => {
                const meta = SOURCE_META[n.source];
                return (
                  <div
                    key={n.id}
                    className="glass-card p-4 flex items-start gap-4"
                  >
                    <meta.Icon
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        n.severity === "critical"
                          ? "text-rose-400"
                          : n.severity === "warning"
                            ? "text-yellow-400"
                            : "text-black-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-14 font-semibold text-white">{n.title}</p>
                        <span className="text-10 font-bold uppercase tracking-wider text-black-400 border border-black-700 rounded-full px-2 py-0.5">
                          {meta.label}
                        </span>
                        {n.severity !== "info" && (
                          <span
                            className={`text-10 font-bold uppercase tracking-wider ${
                              n.severity === "critical" ? "text-rose-300" : "text-yellow-300"
                            }`}
                          >
                            {n.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-13 text-black-300 mt-1 break-words">{n.detail}</p>
                    </div>
                    <span className="text-12 text-black-500 whitespace-nowrap">
                      {fmtDateTime(n.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
