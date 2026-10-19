"use client";

import * as React from "react";
import {
  CreditCard,
  Check,
  AlertCircle,
  Sparkles,
  Coins,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import {
  getUsageRepository,
  resolveWorkspaceId,
  type WorkspaceUsage,
} from "@/lib/data";
import { PLAN_CATALOG, type PlanDefinition } from "@/lib/billing/plans";
import type { PlanType } from "@/types";

const METRIC_LABELS: Record<string, string> = {
  leads: "Leads",
  campaigns: "Campaigns (active)",
  emailsPerMonth: "Emails / month",
  accounts: "Connected accounts",
};

interface BillingNotice {
  tone: "error" | "info";
  text: string;
}

export default function BillingPage() {
  const usageRepo = React.useMemo(() => getUsageRepository(), []);
  const isDemo = usageRepo.mode === "demo";

  const [usage, setUsage] = React.useState<WorkspaceUsage | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<BillingNotice | null>(null);
  const [busyPlan, setBusyPlan] = React.useState<string | null>(null);
  const [portalBusy, setPortalBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (!ws) return;
        const data = await usageRepo.getWorkspaceUsage(ws);
        if (!cancelled) setUsage(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load billing data."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usageRepo]);

  /**
   * Plan buttons call the REAL checkout route. It creates a Stripe
   * Checkout session only when billing is fully configured; otherwise
   * it refuses (503) with the derived state — which we render verbatim.
   * Nothing here can produce a fake success: without a session URL
   * from the server, the user stays on this page with the message.
   */
  const handleSelectPlan = async (plan: PlanType) => {
    setNotice(null);
    setBusyPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: "monthly" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        state?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice({
        tone: "error",
        text:
          data.error ??
          `Checkout could not be started (HTTP ${res.status}). Nothing was charged.`,
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Checkout could not be reached. Nothing was charged — please try again.",
      });
    } finally {
      setBusyPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    setNotice(null);
    setPortalBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice({
        tone: "error",
        text:
          data.error ??
          `The billing portal could not be opened (HTTP ${res.status}).`,
      });
    } catch {
      setNotice({
        tone: "error",
        text: "The billing portal could not be reached. Please try again.",
      });
    } finally {
      setPortalBusy(false);
    }
  };

  const currentPlan: PlanDefinition | null = usage
    ? PLAN_CATALOG[usage.plan]
    : null;

  return (
    <div className="space-y-7 pb-14 max-w-5xl">
      {isDemo && <DemoBanner feature="Billing & Credits" />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Billing & Credits
          </h1>
          {isDemo && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Your plan, its monthly quotas, and payment management. Plan
          changes apply only when Stripe confirms them via webhook —
          never from this page alone.
        </p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {notice && (
        <div
          className={`rounded-2xl px-5 py-3.5 text-13 flex items-start gap-2.5 border ${
            notice.tone === "error"
              ? "border-orange-500/40 bg-orange-950/20 text-orange-200"
              : "border-purple-500/40 bg-purple-950/20 text-purple-100"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{notice.text}</span>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="glass-card p-6 sm:p-8 space-y-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-12 font-semibold uppercase tracking-wider text-purple-400">
                Current Plan
              </span>
              {isDemo && (
                <span className="demo-badge text-10 py-0.5 px-2">Demo Mode</span>
              )}
            </div>
            <h2 className="text-24 sm:text-28 font-extrabold text-white mt-1">
              {currentPlan
                ? `${currentPlan.name} — $${currentPlan.monthlyPriceUsd}/mo`
                : "Loading plan…"}
            </h2>
            <p className="text-13 text-black-300 mt-1">
              {isDemo
                ? "Demo Mode: this plan comes from the demo dataset. No subscription exists and nothing is billed."
                : "Resolved from your workspace's subscription record. Changes take effect when Stripe's webhook confirms them."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenPortal}
            disabled={portalBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-black-700 hover:bg-black-600 px-5 py-2.5 text-14 font-semibold text-white transition-all self-start sm:self-auto disabled:opacity-50"
          >
            {portalBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 text-orange-300" />
            )}
            <span>Manage Billing (Stripe Portal)</span>
          </button>
        </div>

        {/* Usage quota bars — computed from usage data, never hardcoded */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-black-700/80">
          {usage?.checks.map((check) => (
            <div key={check.metric} className="space-y-2">
              <div className="flex items-center justify-between text-13">
                <span className="text-black-300 font-medium">
                  {METRIC_LABELS[check.metric] ?? check.metric}
                </span>
                <span className="font-semibold text-white">
                  {check.used.toLocaleString()} / {check.limit.toLocaleString()} (
                  {check.percentUsed}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-black-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    check.allowed
                      ? "bg-gradient-to-r from-purple-600 to-orange-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${check.percentUsed}%` }}
                />
              </div>
              {!check.allowed && (
                <p className="text-11 text-rose-300">
                  Over this plan&apos;s limit for the current period.
                </p>
              )}
            </div>
          ))}
          {!usage && !loadError && (
            <p className="text-13 text-black-400">Loading usage…</p>
          )}
          {usage && usage.checks.length === 0 && (
            <p className="text-13 text-black-400">
              No usage recorded for the current period yet.
            </p>
          )}
        </div>
      </div>

      {/* Credits panel — honest: quotas, not a balance */}
      <div id="credits" className="glass-card p-6 sm:p-8 space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Coins className="h-5 w-5 text-orange-400" />
          <h3 className="text-18 font-bold text-white">Credits & Plan Quotas</h3>
          {isDemo && <span className="demo-badge text-10 py-0.5 px-2">Demo</span>}
        </div>
        <div className="text-13 text-black-300 leading-relaxed space-y-2">
          <p>
            <strong className="text-white">
              NxtSend does not have a credit balance.
            </strong>{" "}
            There is no wallet, ledger or purchasable credit pack. What your
            plan gives you is a set of <em>monthly quotas</em> — leads,
            campaigns and emails per month — shown above from your actual
            usage records.
          </p>
          <p>
            If you have seen a figure like <strong className="text-white">1,000,000</strong>,
            that is the Agency plan&apos;s monthly email quota (a limit, not
            a balance). Your remaining allowance for any metric is simply
            its limit minus what you have used this month.
          </p>
          <p>
            To get more capacity, upgrade the plan below — there are no
            separate credits to buy.
          </p>
        </div>
        {usage && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {usage.checks.map((check) => (
              <div
                key={check.metric}
                className="rounded-2xl border border-black-700 bg-black-800/60 p-4"
              >
                <p className="text-11 font-semibold uppercase tracking-wider text-black-400">
                  {METRIC_LABELS[check.metric] ?? check.metric} remaining
                </p>
                <p className="text-22 font-extrabold text-white mt-1">
                  {check.remaining.toLocaleString()}
                </p>
                <p className="text-11 text-black-400">
                  of {check.limit.toLocaleString()} monthly quota
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plans */}
      <div id="plans" className="glass-card p-6 space-y-5 scroll-mt-24">
        <div>
          <h3 className="text-18 font-bold text-white">Available Plans</h3>
          <p className="text-13 text-black-300 mt-0.5">
            Prices and quotas come from the plan catalog — the same source
            the usage limits are enforced from. Selecting a plan starts a
            real Stripe Checkout when billing is configured, and reports
            the actual state when it is not.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(["starter", "growth", "agency"] as PlanType[]).map((planId) => {
            const plan = PLAN_CATALOG[planId];
            const isCurrent = usage?.plan === planId;
            const highlighted = planId === "growth";
            return (
              <div
                key={planId}
                className={`rounded-2xl p-5 space-y-4 relative ${
                  highlighted
                    ? "border-2 border-purple-500 bg-purple-950/20 shadow-glow-purple"
                    : "border border-black-700 bg-black-800/60"
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 right-4 rounded-full bg-purple-600 px-2.5 py-0.5 text-10 font-bold uppercase tracking-wider text-white">
                    Most Popular
                  </span>
                )}
                <div>
                  <span className="text-14 font-bold text-white">{plan.name}</span>
                  <div className="mt-2 text-24 font-extrabold text-white">
                    ${plan.monthlyPriceUsd}
                    <span className="text-13 text-black-400 font-normal">/mo</span>
                  </div>
                  <p className="text-12 text-black-400 mt-1">{plan.tagline}</p>
                </div>
                <ul className="space-y-2 text-12 text-black-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span>{plan.limits.leads.toLocaleString()} leads</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span>
                      {plan.limits.campaigns >= 999
                        ? "Unlimited campaigns"
                        : `${plan.limits.campaigns} campaigns`}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span>
                      {plan.limits.emailsPerMonth.toLocaleString()} emails / month
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span>{plan.limits.accounts} connected accounts</span>
                  </li>
                </ul>
                <button
                  type="button"
                  disabled={isCurrent || busyPlan !== null}
                  onClick={() => handleSelectPlan(planId)}
                  className={`w-full rounded-xl py-2 text-13 font-semibold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 ${
                    highlighted
                      ? "bg-purple-600 hover:bg-purple-500 text-white shadow-glow-purple"
                      : "bg-black-700 hover:bg-black-600 text-white"
                  }`}
                >
                  {busyPlan === planId && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{isCurrent ? "Current Plan" : `Select ${plan.name}`}</span>
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-12 text-black-500 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          Checkout is created by Stripe only when STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET and the plan&apos;s STRIPE_PRICE_ID_* are
          configured — otherwise the exact unconfigured state is shown
          above instead of a simulated success.
        </p>
      </div>

      {/* Billing History */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-16 font-semibold text-white">Billing History</h3>
        <div className="rounded-xl border border-black-700/80 bg-black-800/40 p-8 text-center text-black-400 text-13">
          <CreditCard className="h-8 w-8 mx-auto text-black-600 mb-2" />
          <p>
            {isDemo
              ? "No billing history — Demo Mode"
              : "No invoices recorded for this workspace yet"}
          </p>
          <p className="text-11 text-black-500 mt-0.5">
            Invoices and receipts are issued by Stripe and available through
            the billing portal once a subscription exists.
          </p>
        </div>
      </div>
    </div>
  );
}
