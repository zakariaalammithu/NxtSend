"use client";

/**
 * Email Warm-up — provider status surface (P5 Stage E).
 *
 * Warm-up is operated ENTIRELY by Instantly, an external provider:
 * mailboxes are connected to Instantly, and Instantly's own network
 * performs the gradual sending-volume ramp. This page only displays
 * what Instantly's API reports (via GET /api/email/warmup):
 *
 *  - Unconfigured / Demo Mode → the honest "Unavailable — provider
 *    not connected" state with setup guidance. There is deliberately
 *    NO simulated warm-up: no fake mailboxes, no fake progress, no
 *    "warming" indicator without a real provider behind it.
 *  - Configured → the provider-reported per-mailbox status, limits
 *    and activity, labelled as Instantly's data with its fetch time.
 *
 * Copy rule: warm-up is described factually (a gradual volume ramp
 * run by the provider). Nothing here promises inbox placement or
 * deliverability gains.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Flame,
  PlugZap,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { WarmupMailbox, WarmupStatusReport } from "@/lib/warmup/types";

interface WarmupResponse {
  mode: string;
  available: boolean;
  state: string;
  message: string;
  providerLabel: string;
  docsUrl: string;
  signupUrl: string;
  envVars: string[];
  pricingNote: string;
  report: WarmupStatusReport | null;
}

const WARMUP_STATUS_CHIP: Record<WarmupMailbox["warmupStatus"], string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-black-700 text-black-300",
  banned: "bg-rose-500/15 text-rose-400",
  spam_folder_unknown: "bg-amber-500/15 text-amber-400",
  permanent_suspension: "bg-rose-500/15 text-rose-400",
  unknown: "bg-black-700 text-black-300",
};

function dash(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "Not reported"
    : String(value);
}

function MailboxRow({ mailbox }: { mailbox: WarmupMailbox }) {
  const a = mailbox.analytics;
  return (
    <div className="rounded-xl bg-black-800/60 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-14 font-medium text-white">{mailbox.email}</p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold ${WARMUP_STATUS_CHIP[mailbox.warmupStatus]}`}
        >
          Warm-up: {mailbox.warmupStatusLabel}
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-black-700 text-black-300">
          Account: {mailbox.accountStatusLabel}
        </span>
        {mailbox.mailboxProvider && (
          <span className="text-12 text-black-500">{mailbox.mailboxProvider}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <div>
          <p className="text-12 text-black-500">Warm-up daily limit (provider-set)</p>
          <p className="text-14 font-semibold text-white mt-0.5">
            {mailbox.warmupDailyLimit === null
              ? "Not reported"
              : `${mailbox.warmupDailyLimit} / day`}
          </p>
        </div>
        <div>
          <p className="text-12 text-black-500">Ramp increment</p>
          <p className="text-14 font-semibold text-white mt-0.5">
            {mailbox.warmupIncrement === null
              ? "Not reported"
              : mailbox.warmupIncrement === "disabled"
                ? "Disabled (full limit from day one)"
                : `+${mailbox.warmupIncrement} / day`}
          </p>
        </div>
        <div>
          <p className="text-12 text-black-500">Warm-up score (Instantly)</p>
          <p className="text-14 font-semibold text-white mt-0.5">
            {mailbox.warmupScore === null ? "Not reported" : mailbox.warmupScore}
          </p>
        </div>
        <div>
          <p className="text-12 text-black-500">Warm-up started</p>
          <p className="text-14 font-semibold text-white mt-0.5">
            {mailbox.warmupStartedAt
              ? new Date(mailbox.warmupStartedAt).toLocaleDateString()
              : "Not reported"}
          </p>
        </div>
      </div>

      {a ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 border-t border-black-700/60 pt-4">
          <div>
            <p className="text-12 text-black-500">Warm-up sent</p>
            <p className="text-14 font-semibold text-white mt-0.5">{dash(a.sent)}</p>
          </div>
          <div>
            <p className="text-12 text-black-500">Warm-up received</p>
            <p className="text-14 font-semibold text-white mt-0.5">{dash(a.received)}</p>
          </div>
          <div>
            <p className="text-12 text-black-500">Landed in inbox</p>
            <p className="text-14 font-semibold text-white mt-0.5">{dash(a.landedInbox)}</p>
          </div>
          <div>
            <p className="text-12 text-black-500">Landed in spam</p>
            <p className="text-14 font-semibold text-white mt-0.5">{dash(a.landedSpam)}</p>
          </div>
          <div>
            <p className="text-12 text-black-500">Health score (Instantly)</p>
            <p className="text-14 font-semibold text-white mt-0.5">
              {a.healthScore === null
                ? "Not reported"
                : `${a.healthScore}${a.healthScoreLabel ? ` · ${a.healthScoreLabel}` : ""}`}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-12 text-black-500 mt-4 border-t border-black-700/60 pt-3">
          Instantly returned no warm-up analytics for this mailbox — for
          example when warm-up has not been enabled for it in Instantly.
        </p>
      )}
    </div>
  );
}

export default function WarmupPage() {
  const [data, setData] = useState<WarmupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/warmup", { cache: "no-store" });
      const body = (await res.json()) as WarmupResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load warm-up status."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDemo = data?.mode === "demo";
  const report = data?.report ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/email"
          className="inline-flex items-center gap-1.5 text-13 text-black-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Email
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="text-24 font-bold text-white">Email Warm-up</h1>
          {data &&
            (isDemo ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-amber-500/15 text-amber-400">
                Demo Mode
              </span>
            ) : data.available ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-emerald-500/15 text-emerald-400">
                Reported by {data.providerLabel}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-black-700 text-black-300">
                Unavailable
              </span>
            ))}
        </div>
        <p className="text-14 text-black-400 mt-1 max-w-3xl">
          Warm-up gradually raises a mailbox&apos;s sending volume over
          time. In NxtSend it is operated entirely by the external
          provider Instantly, on Instantly&apos;s own network — NxtSend
          never sends warm-up mail itself; it only shows the status
          Instantly reports.
        </p>
      </div>

      {loading && (
        <div className="glass-card p-6">
          <p className="text-13 text-black-400 text-center py-6">
            Loading warm-up status…
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="glass-card p-6 text-center">
          <p className="text-14 text-rose-400">{error}</p>
          <button
            onClick={load}
            className="btn-secondary mt-4 !py-2 !px-4 text-13"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && data && !data.available && (
        <div className="glass-card p-6" data-testid="warmup-unavailable">
          <div className="flex flex-col md:flex-row gap-5">
            <div className="w-11 h-11 rounded-xl bg-black-700 flex items-center justify-center shrink-0">
              <PlugZap className="w-5 h-5 text-black-300" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-16 font-bold text-white">
                Unavailable — provider not connected
              </h2>
              <p className="text-13 text-black-400 mt-1">{data.message}</p>

              <h3 className="text-14 font-semibold text-white mt-5">
                How warm-up works here
              </h3>
              <ul className="text-13 text-black-400 mt-2 space-y-1.5 list-disc pl-5">
                <li>
                  You connect your mailboxes to Instantly and enable
                  warm-up there — Instantly&apos;s network exchanges the
                  warm-up mail and ramps each mailbox&apos;s daily volume
                  gradually.
                </li>
                <li>
                  NxtSend connects to Instantly&apos;s API with a
                  read-only key and displays the status Instantly
                  reports: per-mailbox warm-up state, the daily limit
                  and ramp Instantly has set, and Instantly&apos;s own
                  activity totals.
                </li>
                <li>
                  Nothing is simulated: without the provider connection
                  this page shows Unavailable rather than invented
                  progress.
                </li>
              </ul>

              <h3 className="text-14 font-semibold text-white mt-5">
                What you need
              </h3>
              <ol className="text-13 text-black-400 mt-2 space-y-1.5 list-decimal pl-5">
                <li>
                  An Instantly account. {data.pricingNote}
                </li>
                <li>
                  Your mailboxes connected in Instantly, with warm-up
                  enabled for them in Instantly&apos;s dashboard.
                </li>
                <li>
                  An Instantly API key with the accounts:read scope
                  (Instantly → Settings → Integrations → API), set as the
                  server environment variable{" "}
                  <code className="text-black-200">INSTANTLY_API_KEY</code>,
                  then redeploy.
                </li>
              </ol>

              <div className="flex flex-wrap gap-2 mt-5">
                <Link
                  href="/dashboard/integrations/warmup"
                  className="btn-primary !py-2 !px-4 text-13"
                >
                  <Flame className="w-4 h-4" /> Open the Warm-up integration
                </Link>
                <a
                  href={data.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary !py-2 !px-3 text-13"
                >
                  Instantly plans <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={data.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary !py-2 !px-3 text-13"
                >
                  Instantly API docs <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && data && data.available && report && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-13 text-black-400">
              Status as reported by {report.providerLabel} · fetched{" "}
              {new Date(report.fetchedAt).toLocaleString()} ·{" "}
              {report.mailboxes.length} mailbox
              {report.mailboxes.length === 1 ? "" : "es"}
            </p>
            <button
              onClick={load}
              className="btn-secondary !py-1.5 !px-3 text-12"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {report.analyticsError && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-600/10 px-5 py-4 flex gap-3">
              <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-13 text-amber-200">
                Mailbox settings were loaded, but warm-up analytics could
                not be read: {report.analyticsError}
              </p>
            </div>
          )}

          {report.mailboxes.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <Flame className="w-10 h-10 text-black-600 mx-auto mb-3" />
              <p className="text-14 text-black-300 font-medium">
                Instantly returned no mailboxes
              </p>
              <p className="text-13 text-black-500 mt-1">
                Connect mailboxes in Instantly first — this page reports
                exactly what the provider returns, and it returned none.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.mailboxes.map((mailbox) => (
                <MailboxRow key={mailbox.email} mailbox={mailbox} />
              ))}
            </div>
          )}

          <p className="text-12 text-black-500 max-w-3xl">
            Every figure on this page is Instantly&apos;s own reported
            data — including the scores, which Instantly computes.
            Warm-up settings (including enabling or pausing warm-up per
            mailbox) are changed in Instantly&apos;s dashboard; this
            connection is read-only.
          </p>
        </>
      )}
    </div>
  );
}
