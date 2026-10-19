"use client";

import * as React from "react";
import { AdminPageHeader } from "@/components/admin/AdminBits";
import { PLAN_CATALOG, PLAN_IDS } from "@/lib/billing/plans";

/**
 * Admin → Billing → Credit Rules. NxtSend meters by plan quota, not
 * by a credit balance: these are the rules, read live from the single
 * source of truth (PLAN_CATALOG in src/lib/billing/plans.ts, whose
 * limits come from planLimits in src/lib/utils.ts).
 *
 * Honest constraint, stated on the page: rule changes are CODE-level
 * today. There is deliberately no Save button — a UI that pretended
 * to persist rules nothing enforces would be worse than none.
 */
export default function AdminCreditRulesPage() {
  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Credit Rules"
        description="Plan quotas and how they are enforced. 'Credits' in NxtSend are plan limits: each workspace's plan caps leads, campaigns, connected accounts, and monthly email volume."
      />

      <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/20 px-5 py-4 text-13 text-yellow-200">
        <strong>Read-only by design:</strong> these values come from{" "}
        <span className="font-mono">src/lib/billing/plans.ts</span> /{" "}
        <span className="font-mono">planLimits</span> in code. Changing a rule
        today means changing that single source and redeploying — no admin UI
        writes billing rules, so nothing here can silently diverge from what
        the code enforces.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PLAN_IDS.map((id) => {
          const plan = PLAN_CATALOG[id];
          return (
            <div key={id} className="glass-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-18 font-bold text-white">{plan.name}</h2>
                <p className="text-14 text-black-300">
                  ${plan.monthlyPriceUsd}
                  <span className="text-black-500"> /mo</span>
                </p>
              </div>
              <p className="text-13 text-black-400 mt-1">{plan.tagline}</p>
              <dl className="mt-4 space-y-2">
                {(
                  [
                    ["Leads", plan.limits.leads],
                    ["Campaigns", plan.limits.campaigns],
                    ["Connected accounts", plan.limits.accounts],
                    ["Emails per month", plan.limits.emailsPerMonth],
                  ] as Array<[string, number]>
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-black-800/60 py-1.5"
                  >
                    <dt className="text-13 text-black-300">{label}</dt>
                    <dd className="text-13 font-semibold text-white">
                      {value.toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-12 text-black-500 mt-4">
                Stripe Price env:{" "}
                <span className="font-mono">{plan.stripePriceEnv.monthly}</span> /{" "}
                <span className="font-mono">{plan.stripePriceEnv.annual}</span>{" "}
                (annual)
              </p>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6">
        <h2 className="text-16 font-bold text-white mb-3">Where enforcement actually happens</h2>
        <ul className="space-y-2.5 text-13 text-black-300 list-disc pl-5">
          <li>
            <strong className="text-black-100">checkLimit / canAdd</strong> (
            <span className="font-mono">src/lib/billing/limits.ts</span>) — pure
            functions any server path can call to decide whether an action
            fits the workspace&rsquo;s plan quota.
          </li>
          <li>
            <strong className="text-black-100">usage_rollup job</strong> —
            recomputes real per-workspace counts monthly into usage_records
            and flags over-limit workspaces in its run log (see Usage &
            Credits for the current flags).
          </li>
          <li>
            <strong className="text-black-100">Email suppression</strong> — the
            Resend adapter refuses suppressed recipients before any send,
            independent of quota.
          </li>
          <li>
            <strong className="text-black-100">Known gap (stated honestly):</strong>{" "}
            lead import and campaign creation do not yet call checkLimit in
            the product flow — quota is currently measured and flagged, not
            hard-blocked at creation time. Wiring those call sites is a
            product decision (hard block vs warn) tracked in the audit.
          </li>
        </ul>
      </div>
    </div>
  );
}
