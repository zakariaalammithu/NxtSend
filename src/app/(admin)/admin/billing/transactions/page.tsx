"use client";

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
import type { BillingOverview } from "@/lib/admin/platform-server";

/**
 * Admin → Billing → Transactions. Source: billing_events — rows are
 * written ONLY by the signature-verified Stripe webhook handler, one
 * per processed event (idempotent on event_id). An empty list here is
 * the honest state of a deployment with no verified payments yet;
 * nothing is ever backfilled or invented.
 */
export default function AdminTransactionsPage() {
  const { data, error, loading, reload } = useAdminFetch<BillingOverview>(
    "/api/admin/billing"
  );

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Transactions"
        description="Verified Stripe webhook events processed by this deployment. Each row is a provider-confirmed event — manual or estimated entries are never added."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading transactions…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.transactions.length === 0 && (
        <EmptyStateBox
          title="No verified payments yet"
          message={
            data.mode === "demo"
              ? "Demo Mode has no payment provider connected, so there are no transactions to show. Connect Stripe (keys + webhook) and verified events will appear here as they are processed."
              : "No Stripe webhook events have been processed yet. When customers subscribe, upgrade, or fail a payment, the verified events will appear here."
          }
        />
      )}

      {data && data.transactions.length > 0 && (
        <div className="glass-card p-6 overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                <th className="py-2 pr-4 font-semibold">Processed</th>
                <th className="py-2 pr-4 font-semibold">Event</th>
                <th className="py-2 pr-4 font-semibold">Provider</th>
                <th className="py-2 pr-4 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-black-800/60">
                  <td className="py-2.5 pr-4 text-black-300 whitespace-nowrap">
                    {fmtDateTime(tx.processed_at)}
                  </td>
                  <td className="py-2.5 pr-4 text-black-200 font-mono text-12">
                    {tx.event_type}
                  </td>
                  <td className="py-2.5 pr-4 text-black-300 capitalize">
                    {tx.provider}
                  </td>
                  <td className="py-2.5 pr-4 text-black-200">
                    {tx.amount !== null
                      ? `${tx.amount.toFixed(2)} ${(tx.currency ?? "").toUpperCase()}`
                      : "—"}
                  </td>
                  <td className="py-2.5 text-black-300">{tx.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
