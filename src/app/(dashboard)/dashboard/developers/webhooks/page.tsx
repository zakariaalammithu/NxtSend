"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { WEBHOOK_EVENT_DESCRIPTIONS } from "@/lib/integrations/rest/events";
import {
  REST_PLATFORMS,
  WEBHOOK_DELIVERY,
  type RestPlatformId,
} from "../reference";

/**
 * Dashboard → Developers → Webhook subscriptions.
 *
 * One session-authenticated list per platform:
 * GET /api/integrations/{platform}/subscriptions returns this
 * workspace's subscriptions plus the last 20 deliveries, from the
 * shared zapier_webhook_subscriptions / zapier_webhook_deliveries
 * tables filtered by platform (migrations 029/031). Secrets and
 * payloads are never selected by that route and are never shown here.
 *
 * Honest limits, stated on the page rather than hidden:
 *  - Subscribing / unsubscribing happens from the platform, with a
 *    Bearer token (POST /v1/webhooks/subscribe and
 *    POST /v1/webhooks/unsubscribe) — there is no session-UI
 *    subscribe button here, because the route does not offer one.
 *  - n8n's manual retry / test endpoints
 *    (POST /api/integrations/n8n/webhooks/retry and .../test) are
 *    Bearer OAuth write-tier only, so this browser UI cannot call
 *    them either. Retries happen on the daily 06:00 cron.
 *  - Delivery is best-effort: immediate attempt, then retries after
 *    5 minutes and 30 minutes (max 3 attempts, then dead), driven
 *    by the daily 06:00 cron — a failed delivery may wait up to
 *    ~24h for its next retry. A 410 from the receiver deactivates
 *    the subscription. Subscriptions inactive for over 30 days are
 *    cleaned up.
 *  - This page shows the subscriptions the platforms hold. The
 *    Integration Center's "Outbound Webhooks" section is where a
 *    workspace configures its own receiver; the public Developers
 *    page documents the same 8 events from the receiver's side
 *    (envelope, HMAC-SHA256 signature verification, endpoint rules).
 */

interface SubscriptionEntry {
  id: string;
  event: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DeliveryEntry {
  id: string;
  event: string;
  subscription_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export default function WebhooksPage() {
  const [platformId, setPlatformId] = React.useState<RestPlatformId>("n8n");
  const platform = REST_PLATFORMS.find((p) => p.id === platformId) ?? REST_PLATFORMS[1];
  const [subs, setSubs] = React.useState<SubscriptionEntry[] | null>(null);
  const [deliveries, setDeliveries] = React.useState<DeliveryEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const loadStatus = React.useCallback(async (pid: RestPlatformId) => {
    setLoading(true);
    setSubs(null);
    setDeliveries(null);
    try {
      const res = await fetch(`/api/integrations/${pid}/subscriptions`);
      const body = (await res.json().catch(() => null)) as
        | {
            subscriptions?: SubscriptionEntry[];
            deliveries?: DeliveryEntry[];
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `Webhook status request failed (HTTP ${res.status})`);
      setSubs(body?.subscriptions ?? []);
      setDeliveries(body?.deliveries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${pid} webhook status.`);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadStatus(platformId);
  }, [platformId, loadStatus]);

  return (
    <div className="space-y-6 pb-14">
      <DemoBanner feature="Developer webhooks" />

      <div>
        <Link
          href="/dashboard/developers"
          className="inline-flex items-center gap-1.5 text-13 font-semibold text-black-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Developers
        </Link>
        <h1 className="mt-2 text-24 sm:text-28 font-bold tracking-tight text-white">Webhook subscriptions</h1>
        <p className="mt-1 text-14 text-black-300 leading-relaxed max-w-3xl">
          The event subscriptions the platforms hold for this workspace, and their recent
          deliveries. Subscriptions are created from the platform — this page lists them; it does
          not create them.
        </p>
      </div>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-16 font-bold text-white">How delivery works</h2>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-13 text-black-300">
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.immediateAttempt}</span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <span className="leading-relaxed">
              {WEBHOOK_DELIVERY.retrySchedule} {WEBHOOK_DELIVERY.cronRetry}
            </span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.deactivate410}</span>
          </li>
          <li className="flex items-start gap-2 text-13 text-black-300">
            <span className="leading-relaxed">{WEBHOOK_DELIVERY.secretNote}</span>
          </li>
        </ul>
        <p className="text-13 text-black-300 leading-relaxed">
          One event fans out to every platform&apos;s active subscriptions, and the outbox dedups
          on (event id, subscription id). The envelope is the same for every event:{" "}
          <code className="font-mono text-black-100">{"{ id, type, created_at, workspace_id, data }"}</code>{" "}
          — the <code className="font-mono text-black-100">id</code> is the stable dedup id, so a
          receiver can safely ignore duplicates. Payload examples, the HMAC-SHA256 verification
          snippet and endpoint requirements live on the{" "}
          <Link href="/developers" className="font-semibold text-purple-300 hover:text-white transition-colors">
            public Developers page
          </Link>
          .
        </p>
        <div className="space-y-1.5">
          <h3 className="text-13 font-semibold text-white">The 8 events</h3>
          <div className="divide-y divide-black-700/60">
            {Object.entries(WEBHOOK_EVENT_DESCRIPTIONS).map(([type, description]) => (
              <div key={type} className="py-2 space-y-0.5">
                <code className="font-mono text-12 text-white">{type}</code>
                <p className="text-12 text-black-400 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-16 font-bold text-white">Subscriptions &amp; deliveries</h2>
          <button
            type="button"
            onClick={() => void loadStatus(platformId)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black-600 bg-black-800 px-3 py-1.5 text-12 font-semibold text-black-200 hover:text-white disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Platform">
          {REST_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={platformId === p.id}
              onClick={() => setPlatformId(p.id)}
              className={`rounded-xl border px-3 py-1.5 text-12 font-semibold transition-colors ${
                platformId === p.id
                  ? "border-purple-500/50 bg-purple-600/20 text-white"
                  : "border-black-600 bg-black-800 text-black-300 hover:text-white"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="text-13 text-black-300 leading-relaxed">
          <strong className="text-white">{platform.name}</strong> —{" "}
          <code className="font-mono text-black-100">{platform.basePath}/webhooks/subscribe</code>{" "}
          is how {platform.name} subscribes (Bearer token, from the platform — not from this page).
          {platform.id === "zapier"
            ? " Zapier subscriptions accept only hooks.zapier.com / zapier.com hosts."
            : " Any public https host is accepted as a target (never a Zapier host); http loopback only on a local deployment."}
        </p>
        {error && <p className="text-13 text-rose-200 leading-relaxed">{error}</p>}
        {!error && loading && subs === null && (
          <p className="text-13 text-black-400">Loading {platform.name} webhook subscriptions…</p>
        )}
        {!error && subs !== null && subs.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">
            No {platform.name} webhook subscriptions for this workspace yet — one appears here when{" "}
            {platform.name} subscribes via POST {platform.basePath}/v1/webhooks/subscribe.
          </p>
        )}
        {subs !== null && subs.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {subs.map((s) => (
              <div key={s.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-13 text-white">{s.event}</code>
                  <Badge variant={s.active ? "success" : "gray"} size="sm">
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-12 text-black-300 break-all">{s.target_url}</p>
                <p className="text-11 text-black-400">
                  Created {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
        <h3 className="text-13 font-semibold text-white pt-2">Recent deliveries (last 20)</h3>
        {!error && deliveries !== null && deliveries.length === 0 && (
          <p className="text-13 text-black-300 leading-relaxed">No deliveries recorded yet.</p>
        )}
        {deliveries !== null && deliveries.length > 0 && (
          <div className="divide-y divide-black-700/60">
            {deliveries.map((d) => (
              <div key={d.id} className="py-2.5 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-12 text-white">{d.event}</code>
                  <Badge
                    variant={
                      d.status === "delivered"
                        ? "success"
                        : d.status === "dead"
                          ? "error"
                          : "gray"
                    }
                    size="sm"
                  >
                    {d.status}
                  </Badge>
                  <span className="text-11 text-black-500">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-12 text-black-400">
                  Attempts: {d.attempts}/{d.max_attempts}
                  {d.last_error ? ` · ${d.last_error}` : ""}
                  {d.status !== "delivered" && d.next_retry_at
                    ? ` · next retry ${new Date(d.next_retry_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="text-12 text-black-400 leading-relaxed">
          Manual retry / test is only available as a Bearer API call for n8n
          (POST /api/integrations/n8n/webhooks/retry and .../test, OAuth write tier only) — this
          session UI cannot call it. A failed delivery&apos;s next attempt is the daily 06:00 cron.
          Unsubscribe is likewise a platform-side Bearer call
          (POST {platform.basePath}/v1/webhooks/unsubscribe).
        </p>
      </section>

      <p className="text-12 text-black-400 leading-relaxed">
        The same subscriptions are visible per platform on the{" "}
        <Link href="/dashboard/integrations/n8n" className="font-semibold text-purple-300 hover:text-white transition-colors">
          n8n Integration Center page
        </Link>{" "}
        and the Zapier detail page. Full endpoint reference:{" "}
        <Link href="/dashboard/developers" className="font-semibold text-purple-300 hover:text-white transition-colors">
          Developers
        </Link>
        .
      </p>
    </div>
  );
}
