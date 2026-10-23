"use client";

import * as React from "react";
import { Mail, MailOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui";
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
  Submission,
  SubmissionNotificationStatus,
} from "@/lib/admin/submissions-core";

interface SubmissionsResponse {
  mode: string;
  submissions: Submission[];
}

const NOTIFICATION_BADGES: Record<
  SubmissionNotificationStatus,
  { label: string; variant: "green" | "red" | "yellow" | "gray" | "orange" }
> = {
  sent: { label: "Notification sent", variant: "green" },
  failed: { label: "Notification failed", variant: "red" },
  not_configured: { label: "Notification not configured", variant: "yellow" },
  simulated: { label: "Notification simulated (demo)", variant: "orange" },
  pending: { label: "Notification pending", variant: "gray" },
};

function NotificationBadge({
  status,
}: {
  status: SubmissionNotificationStatus | null;
}) {
  if (!status) return null;
  const badge = NOTIFICATION_BADGES[status];
  return (
    <Badge variant={badge.variant} size="sm">
      {badge.label}
    </Badge>
  );
}

/**
 * Admin → Submissions. Enquiries captured by POST /api/submissions
 * from the marketing contact form and the demo booking form (both
 * previously discarded their submissions). Read/unread triage goes
 * through the admin-gated status route and writes an audit entry.
 */
export default function AdminSubmissionsPage() {
  const { data, error, loading, reload } = useAdminFetch<SubmissionsResponse>(
    "/api/admin/submissions"
  );
  const [sourceFilter, setSourceFilter] = React.useState<"all" | "contact" | "demo">("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Submission | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const submissions = React.useMemo(() => {
    const all = data?.submissions ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (
        q &&
        !`${s.name} ${s.email} ${s.company ?? ""} ${s.subject ?? ""} ${s.message}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, sourceFilter, statusFilter, search]);

  const unreadCount = (data?.submissions ?? []).filter(
    (s) => s.status === "unread"
  ).length;

  const [retryingId, setRetryingId] = React.useState<string | null>(null);

  async function retryNotification(submission: Submission) {
    setRetryingId(submission.id);
    try {
      const res = await fetch("/api/admin/submissions/retry-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = (await res.json()) as {
        notification_status?: SubmissionNotificationStatus | null;
      };
      if (selected?.id === submission.id && body.notification_status) {
        setSelected({
          ...submission,
          notification_status: body.notification_status,
          notification_attempts:
            submission.notification_attempts +
            (body.notification_status === "not_configured" ||
            body.notification_status === "simulated"
              ? 0
              : 1),
        });
      }
      reload();
    } catch {
      reload();
    } finally {
      setRetryingId(null);
    }
  }

  async function toggleStatus(submission: Submission) {
    const next = submission.status === "unread" ? "read" : "unread";
    setBusyId(submission.id);
    try {
      const res = await fetch("/api/admin/submissions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id, status: next }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      if (selected?.id === submission.id) {
        setSelected({ ...submission, status: next });
      }
      reload();
    } catch {
      // The row simply stays in its previous state; the list reload
      // below shows the server truth.
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Submissions"
        description="Enquiries from the public contact form and the demo booking form, captured by POST /api/submissions. Stored in the submissions table (live) or the demo store (Demo Mode) — never discarded."
        badge={unreadCount > 0 ? `${unreadCount} unread` : undefined}
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading submissions…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          {/* Filters */}
          <div className="glass-card p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, message…"
                className="input-field pl-10 py-2.5 text-13"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
                aria-label="Filter by source"
              >
                <option value="all">All sources</option>
                <option value="contact">Contact form</option>
                <option value="demo">Demo booking</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </div>
          </div>

          {submissions.length === 0 ? (
            <EmptyStateBox
              title="No submissions"
              message={
                data.submissions.length === 0
                  ? "No enquiries have been submitted yet. Messages sent through the marketing contact form or the demo booking form will appear here."
                  : "No submissions match the current filters."
              }
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              {/* List */}
              <div className="xl:col-span-2 space-y-2">
                {submissions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                      selected?.id === s.id
                        ? "border-rose-500/50 bg-rose-950/20"
                        : "border-black-700/70 bg-black-800/40 hover:bg-black-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-14 font-semibold text-white truncate">
                        {s.name}
                      </span>
                      {s.status === "unread" ? (
                        <Badge variant="red">Unread</Badge>
                      ) : (
                        <Badge variant="gray">Read</Badge>
                      )}
                    </div>
                    <p className="text-12 text-black-400 truncate mt-0.5">{s.email}</p>
                    <p className="text-13 text-black-300 truncate mt-1.5">
                      {s.subject ?? s.message}
                    </p>
                    <p className="text-11 text-black-500 mt-1.5">
                      {s.source === "demo" ? "Demo booking" : "Contact form"} ·{" "}
                      {fmtDateTime(s.created_at)}
                    </p>
                    {s.source === "contact" && s.notification_status && (
                      <span className="mt-2 inline-block">
                        <NotificationBadge status={s.notification_status} />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Detail */}
              <div className="xl:col-span-3">
                {selected ? (
                  <div className="glass-card p-6 space-y-4 sticky top-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-18 font-bold text-white">{selected.name}</h2>
                        <p className="text-13 text-black-400">
                          {selected.email}
                          {selected.company ? ` · ${selected.company}` : ""}
                        </p>
                        <p className="text-12 text-black-500 mt-1">
                          {selected.source === "demo"
                            ? "Demo booking request"
                            : "Contact form"}{" "}
                          · {fmtDateTime(selected.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === selected.id}
                        onClick={() => toggleStatus(selected)}
                        className="inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-3.5 py-2 text-12 font-semibold text-white hover:bg-black-700 disabled:opacity-50"
                      >
                        {selected.status === "unread" ? (
                          <MailOpen className="h-3.5 w-3.5" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        Mark as {selected.status === "unread" ? "read" : "unread"}
                      </button>
                    </div>
                    {selected.subject && (
                      <div>
                        <p className="text-11 font-bold uppercase tracking-wider text-black-500">
                          Subject
                        </p>
                        <p className="text-14 text-white mt-1">{selected.subject}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-11 font-bold uppercase tracking-wider text-black-500">
                        Message
                      </p>
                      <p className="text-14 text-black-200 mt-1 whitespace-pre-wrap">
                        {selected.message}
                      </p>
                    </div>
                    {selected.source === "contact" && (
                      <div>
                        <p className="text-11 font-bold uppercase tracking-wider text-black-500">
                          Email notification
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <NotificationBadge status={selected.notification_status} />
                          {selected.notification_status === null && (
                            <span className="text-13 text-black-400">
                              Not attempted
                            </span>
                          )}
                          {(selected.notification_status === "failed" ||
                            selected.notification_status === "not_configured") && (
                            <button
                              type="button"
                              disabled={retryingId === selected.id}
                              onClick={() => retryNotification(selected)}
                              className="inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-3 py-1.5 text-12 font-semibold text-white hover:bg-black-700 disabled:opacity-50"
                            >
                              {retryingId === selected.id
                                ? "Retrying…"
                                : "Retry notification"}
                            </button>
                          )}
                        </div>
                        <dl className="mt-2 space-y-1 text-13">
                          {selected.notification_recipient && (
                            <div className="flex gap-2">
                              <dt className="text-black-400 font-medium">Recipient:</dt>
                              <dd className="text-black-200">
                                {selected.notification_recipient}
                              </dd>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <dt className="text-black-400 font-medium">Attempts:</dt>
                            <dd className="text-black-200">
                              {selected.notification_attempts}
                            </dd>
                          </div>
                          {selected.notification_sent_at && (
                            <div className="flex gap-2">
                              <dt className="text-black-400 font-medium">Sent:</dt>
                              <dd className="text-black-200">
                                {fmtDateTime(selected.notification_sent_at)}
                              </dd>
                            </div>
                          )}
                          {selected.notification_provider_id && (
                            <div className="flex gap-2">
                              <dt className="text-black-400 font-medium">Provider ID:</dt>
                              <dd className="text-black-200 font-mono text-12">
                                {selected.notification_provider_id}
                              </dd>
                            </div>
                          )}
                          {selected.notification_error && (
                            <div className="flex gap-2">
                              <dt className="text-black-400 font-medium">Error:</dt>
                              <dd className="text-rose-300">
                                {selected.notification_error}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {selected.notification_status === "simulated" && (
                          <p className="mt-2 text-12 text-black-500">
                            Demo Mode: the submission is stored in the demo
                            store only — no email was sent.
                          </p>
                        )}
                      </div>
                    )}
                    {Object.keys(selected.meta ?? {}).length > 0 && (
                      <div>
                        <p className="text-11 font-bold uppercase tracking-wider text-black-500">
                          Additional fields
                        </p>
                        <dl className="mt-1 space-y-1">
                          {Object.entries(selected.meta).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-13">
                              <dt className="text-black-400 font-medium">{k}:</dt>
                              <dd className="text-black-200">{String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyStateBox
                    title="Select a submission"
                    message="Choose an enquiry from the list to read it and mark it as handled."
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
