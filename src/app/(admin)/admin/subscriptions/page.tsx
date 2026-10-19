"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { BillingOverview } from "@/lib/admin/platform-server";
import { PLAN_CATALOG } from "@/lib/billing/plans";

/**
 * Admin → Billing → Subscriptions. REWIRED in Stage D: previously this
 * page filtered a bundled mock array in the browser. It now reads
 * GET /api/admin/billing — the real subscriptions table (live mode)
 * or the labelled demo dataset (Demo Mode) — and shows the actual
 * Stripe state instead of a hardcoded "sandbox" banner. Amounts come
 * from the single plan catalog, never from invented rows.
 */
export default function AdminSubscriptionsPage() {
  const { data, error, loading, reload } = useAdminFetch<BillingOverview>(
    "/api/admin/billing"
  );
  const [searchQuery, setSearchQuery] = React.useState("");

  const subscriptions = React.useMemo(() => {
    const all = data?.subscriptions ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.workspace_name.toLowerCase().includes(q) ||
        (s.owner_email ?? "").toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  const activeCount = (data?.subscriptions ?? []).filter(
    (s) => s.status === "active"
  ).length;

  return (
    <div className="space-y-6 pb-14">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Platform Subscriptions
          </h1>
          <span className="demo-badge">Billing</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Workspace subscriptions from the billing substrate. Stripe state:{" "}
          <span className="capitalize">
            {data ? data.stripeState.replace(/_/g, " ") : "…"}
          </span>
          {data ? ` · ${activeCount} active of ${data.subscriptions.length}` : ""}.
        </p>
      </div>

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading subscriptions…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="glass-card p-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workspace or owner…"
                className="input-field pl-10 py-2.5 text-13"
              />
            </div>
          </div>

          {subscriptions.length === 0 ? (
            <EmptyStateBox
              title="No subscriptions"
              message="No subscription records match. Subscriptions are created by the Stripe checkout flow and maintained by verified webhook events."
            />
          ) : (
            <div className="glass-card p-6 overflow-x-auto">
              <table className="w-full text-13">
                <thead>
                  <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                    <th className="py-2 pr-4 font-semibold">Workspace</th>
                    <th className="py-2 pr-4 font-semibold">Plan</th>
                    <th className="py-2 pr-4 font-semibold">Amount</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold">Stripe</th>
                    <th className="py-2 font-semibold">Period ends</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
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
                      <td className="py-2.5 pr-4 text-black-200">
                        ${PLAN_CATALOG[sub.plan]?.monthlyPriceUsd ?? 0}/mo
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={
                            sub.status === "active"
                              ? "green"
                              : sub.status === "trialing"
                                ? "blue"
                                : sub.status === "past_due"
                                  ? "yellow"
                                  : "gray"
                          }
                        >
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        {sub.stripe_linked ? (
                          <Badge variant="green">Linked</Badge>
                        ) : (
                          <Badge variant="gray">
                            {data.mode === "demo" ? "Demo record" : "Not linked"}
                          </Badge>
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
        </>
      )}
    </div>
  );
}
