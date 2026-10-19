"use client";

import * as React from "react";
import { Badge } from "@/components/ui";
import {
  AdminPageHeader,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { BillingOverview } from "@/lib/admin/platform-server";

/**
 * Admin → Billing → Revenue. Derived ONLY from subscription records
 * that carry a Stripe subscription id (i.e. created/maintained by
 * signature-verified Stripe webhooks) and sit in an active/trialing
 * state, priced from the single plan catalog. Anything else — demo
 * rows, unlinked records, cancelled plans — is never counted, and
 * when nothing qualifies this page says so instead of showing a
 * plausible-looking number.
 */
export default function AdminRevenuePage() {
  const { data, error, loading, reload } = useAdminFetch<BillingOverview>(
    "/api/admin/billing"
  );

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Revenue"
        description="Monthly recurring revenue derived from verified subscription records. This is a derivation from billing data — not a payment-processor report."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading revenue…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="glass-card p-6">
              <p className="text-12 font-bold uppercase tracking-wider text-black-400">
                Verified MRR
              </p>
              <p className="text-32 font-bold text-white mt-1">
                ${data.revenue.mrr_usd.toLocaleString()}
                <span className="text-14 text-black-400 font-medium"> /mo</span>
              </p>
            </div>
            <div className="glass-card p-6">
              <p className="text-12 font-bold uppercase tracking-wider text-black-400">
                Stripe-linked subscriptions counted
              </p>
              <p className="text-32 font-bold text-white mt-1">
                {data.revenue.verified_subscriptions}
              </p>
            </div>
            <div className="glass-card p-6">
              <p className="text-12 font-bold uppercase tracking-wider text-black-400">
                Stripe state
              </p>
              <p className="text-20 font-bold text-white mt-2 capitalize">
                {data.stripeState.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-black-700/60 bg-black-800/40 px-5 py-4 text-13 text-black-300">
            {data.revenue.note}
          </div>

          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-4">
              Subscriptions behind this number
            </h2>
            {data.subscriptions.length === 0 ? (
              <p className="text-13 text-black-400">No subscription records exist yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                      <th className="py-2 pr-4 font-semibold">Workspace</th>
                      <th className="py-2 pr-4 font-semibold">Plan</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2 pr-4 font-semibold">Stripe-linked</th>
                      <th className="py-2 font-semibold">Period ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((sub) => (
                      <tr key={sub.id} className="border-b border-black-800/60">
                        <td className="py-2.5 pr-4 text-black-200">
                          {sub.workspace_name}
                          {sub.owner_email && (
                            <span className="block text-12 text-black-500">
                              {sub.owner_email}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-black-300 capitalize">{sub.plan}</td>
                        <td className="py-2.5 pr-4 text-black-300 capitalize">{sub.status}</td>
                        <td className="py-2.5 pr-4">
                          {sub.stripe_linked ? (
                            <Badge variant="green">Verified</Badge>
                          ) : (
                            <Badge variant="gray">Not linked</Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-black-300">
                          {fmtDateTime(sub.current_period_end)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
