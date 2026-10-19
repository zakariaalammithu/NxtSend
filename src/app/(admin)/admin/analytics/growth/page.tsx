"use client";

import * as React from "react";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
} from "@/components/admin/AdminBits";
import { getAdminRepository } from "@/lib/data";
import { groupSignupsByMonth } from "@/lib/admin/usage-core";

/**
 * Admin → Analytics → User Growth. REAL derivation: signups grouped by
 * month from the admin users substrate (profiles' created_at in live
 * mode via the role-checked admin API; the labelled demo dataset in
 * Demo Mode). No analytics provider is involved — or claimed.
 */
export default function AdminGrowthPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    mode: string;
    total: number;
    buckets: ReturnType<typeof groupSignupsByMonth>;
  }>({ loading: true, error: null, mode: "demo", total: 0, buckets: [] });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = getAdminRepository();
        const users = await repo.listUsers();
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          mode: repo.mode,
          total: users.length,
          buckets: groupSignupsByMonth(users.map((u) => u.created_at)),
        });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load users.",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxSignups = Math.max(1, ...state.buckets.map((b) => b.signups));

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="User Growth"
        description="Registered users by signup month, derived from account creation dates in the user substrate. This is registration data — not website traffic (no analytics provider is connected; see Website Visitors)."
      />

      {state.mode && !state.loading && <ModeNote mode={state.mode} />}
      {state.loading && <LoadingState label="Loading growth data…" />}
      {state.error && <ErrorState message={state.error} />}

      {!state.loading && !state.error && (
        <>
          <div className="glass-card p-6">
            <p className="text-12 font-bold uppercase tracking-wider text-black-400">
              Total registered users
            </p>
            <p className="text-32 font-bold text-white mt-1">{state.total}</p>
          </div>

          {state.buckets.length === 0 ? (
            <EmptyStateBox
              title="No signups recorded"
              message="Once users register, monthly signup counts appear here."
            />
          ) : (
            <div className="glass-card p-6">
              <h2 className="text-16 font-bold text-white mb-5">Signups by month</h2>
              <div className="space-y-3">
                {state.buckets.map((bucket) => (
                  <div key={bucket.month} className="flex items-center gap-4">
                    <span className="w-20 text-12 font-mono text-black-300">
                      {bucket.month}
                    </span>
                    <div className="flex-1 h-6 rounded-lg bg-black-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-brand rounded-lg"
                        style={{
                          width: `${Math.max(4, (bucket.signups / maxSignups) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-28 text-12 text-black-300 text-right">
                      {bucket.signups} new · {bucket.cumulative} total
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
