"use client";

/**
 * Deliverability (last 30 days) — user Email page card (P5 Stage D).
 *
 * Fed by GET /api/email/deliverability: the session-scoped read over
 * the provider webhook event log. Numbers are provider-confirmed in
 * live mode; in Demo Mode they are a SIMULATED derivation from demo
 * message statuses and the card says so — the classification travels
 * with the payload, so this component cannot present demo numbers as
 * provider data. With no events in the window the card shows an
 * honest empty state instead of zeroed rates.
 */

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

interface DeliverabilityData {
  classification: "provider" | "simulated";
  totals: {
    counts: {
      sent: number;
      delivered: number;
      bounced: number;
      complained: number;
      opened: number;
      clicked: number;
    };
    rates: {
      deliveryRate: number | null;
      bounceRate: number | null;
      complaintRate: number | null;
      openRate: number | null;
      clickRate: number | null;
    };
    eventCount: number;
  };
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-12 text-black-500">{label}</p>
      <p className="text-18 font-bold text-white mt-0.5">{value}</p>
      <p className="text-11 text-black-500 mt-0.5">{sub}</p>
    </div>
  );
}

export default function DeliverabilityCard() {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/deliverability?days=30", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!cancelled) setData(json as DeliverabilityData);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = data?.totals.counts;
  const rates = data?.totals.rates;
  const simulated = data?.classification === "simulated";
  const hasEvents = (data?.totals.eventCount ?? 0) > 0;

  return (
    <div className="glass-card p-6" data-testid="deliverability-card">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-purple-600/15 flex items-center justify-center">
          <Gauge className="w-4 h-4 text-purple-400" />
        </div>
        <h2 className="text-16 font-bold text-white">
          Deliverability (last 30 days)
        </h2>
        {data &&
          (simulated ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-amber-500/15 text-amber-400">
              Simulated — Demo Mode
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-emerald-500/15 text-emerald-400">
              Provider-confirmed
            </span>
          ))}
      </div>

      {failed && (
        <p className="text-13 text-black-400">
          Deliverability data is unavailable right now — the provider event
          log could not be read. No numbers are shown rather than estimated
          ones.
        </p>
      )}

      {data && !hasEvents && (
        <p className="text-13 text-black-400">
          No delivery events recorded in the last 30 days yet. Opens,
          bounces and complaints exist only when the provider&apos;s
          webhooks report them — this card never invents them.
        </p>
      )}

      {data && counts && rates && hasEvents && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Metric label="Sent" value={String(counts.sent)} sub={simulated ? "Simulated sends" : "Provider-accepted"} />
          <Metric label="Delivered" value={String(counts.delivered)} sub={`${pct(rates.deliveryRate)} of sent`} />
          <Metric label="Bounced" value={String(counts.bounced)} sub={`${pct(rates.bounceRate)} of sent`} />
          <Metric label="Complained" value={String(counts.complained)} sub={`${pct(rates.complaintRate)} of sent`} />
          <Metric label="Opened" value={String(counts.opened)} sub={`${pct(rates.openRate)} of delivered`} />
          <Metric label="Clicked" value={String(counts.clicked)} sub={`${pct(rates.clickRate)} of delivered`} />
        </div>
      )}
    </div>
  );
}
