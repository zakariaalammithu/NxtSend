"use client";

import * as React from "react";
import { CreditCard, Check, AlertCircle, Sparkles, Clock } from "lucide-react";
import { DemoBanner, Modal } from "@/components/ui";

export default function BillingPage() {
  const [upgradeModalOpen, setUpgradeModalOpen] = React.useState(false);

  return (
    <div className="space-y-7 pb-14 max-w-5xl">
      <DemoBanner feature="Billing — Stripe is not configured" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Billing & Subscription
          </h1>
          <span className="demo-badge">Demo Mode</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Manage your plan quotas, team seats, and payment methods.
        </p>
      </div>

      {/* Current Plan Card */}
      <div className="glass-card p-6 sm:p-8 space-y-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-12 font-semibold uppercase tracking-wider text-purple-400">
                Current Plan
              </span>
              <span className="demo-badge text-10 py-0.5 px-2">Free Trial</span>
            </div>
            <h2 className="text-24 sm:text-28 font-extrabold text-white mt-1">
              14-Day Pro Trial
            </h2>
            <div className="flex items-center gap-2 text-13 text-orange-300 mt-1">
              <Clock className="h-4 w-4" />
              <span>14 days remaining in your evaluation trial</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setUpgradeModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
          >
            <Sparkles className="h-4 w-4 text-orange-300" />
            <span>Upgrade Plan</span>
          </button>
        </div>

        {/* Usage Quota Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-black-700/80">
          {/* Leads Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-13">
              <span className="text-black-300 font-medium">Leads Contacted</span>
              <span className="font-semibold text-white">5 / 500 (1%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-black-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-orange-500 transition-all"
                style={{ width: "1%" }}
              />
            </div>
          </div>

          {/* Campaigns Quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-13">
              <span className="text-black-300 font-medium">Active Sequences</span>
              <span className="font-semibold text-white">1 / 3 (33%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-black-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-orange-500 transition-all"
                style={{ width: "33%" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Plan Comparison Mini-Table */}
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="text-18 font-bold text-white">Available Plans</h3>
          <p className="text-13 text-black-300 mt-0.5">
            Scale your outreach capacity with unlimited sequences and high throughput.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Free */}
          <div className="rounded-2xl border border-black-700 bg-black-800/60 p-5 space-y-4">
            <div>
              <span className="text-14 font-bold text-white">Starter</span>
              <div className="mt-2 text-24 font-extrabold text-white">
                $49<span className="text-13 text-black-400 font-normal">/mo</span>
              </div>
              <p className="text-12 text-black-400 mt-1">For solo founders and early SDRs</p>
            </div>
            <ul className="space-y-2 text-12 text-black-300">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>2,000 monthly lead quota</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>10 active campaigns</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>LinkedIn + Email orchestration</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="w-full rounded-xl bg-black-700 hover:bg-black-600 py-2 text-13 font-semibold text-white transition-colors"
            >
              Select Starter
            </button>
          </div>

          {/* Growth (Highlighted) */}
          <div className="rounded-2xl border-2 border-purple-500 bg-purple-950/20 p-5 space-y-4 relative shadow-glow-purple">
            <span className="absolute -top-3 right-4 rounded-full bg-purple-600 px-2.5 py-0.5 text-10 font-bold uppercase tracking-wider text-white">
              Most Popular
            </span>
            <div>
              <span className="text-14 font-bold text-white">Growth</span>
              <div className="mt-2 text-24 font-extrabold text-white">
                $149<span className="text-13 text-black-400 font-normal">/mo</span>
              </div>
              <p className="text-12 text-black-400 mt-1">For growing sales teams</p>
            </div>
            <ul className="space-y-2 text-12 text-black-200">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-orange-400" />
                <span>10,000 monthly lead quota</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-orange-400" />
                <span>50 active campaigns</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-orange-400" />
                <span>Unified multi-inbox & sentiment tags</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 py-2 text-13 font-semibold text-white shadow-glow-purple transition-all"
            >
              Select Growth
            </button>
          </div>

          {/* Agency */}
          <div className="rounded-2xl border border-black-700 bg-black-800/60 p-5 space-y-4">
            <div>
              <span className="text-14 font-bold text-white">Agency</span>
              <div className="mt-2 text-24 font-extrabold text-white">
                $299<span className="text-13 text-black-400 font-normal">/mo</span>
              </div>
              <p className="text-12 text-black-400 mt-1">For agencies & large SDR pods</p>
            </div>
            <ul className="space-y-2 text-12 text-black-300">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>100,000 monthly lead quota</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>Unlimited campaigns</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>Dedicated account manager</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="w-full rounded-xl bg-black-700 hover:bg-black-600 py-2 text-13 font-semibold text-white transition-colors"
            >
              Select Agency
            </button>
          </div>
        </div>
      </div>

      {/* Billing History Section */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-16 font-semibold text-white">Billing History</h3>
        <div className="rounded-xl border border-black-700/80 bg-black-800/40 p-8 text-center text-black-400 text-13">
          <CreditCard className="h-8 w-8 mx-auto text-black-600 mb-2" />
          <p>No billing history — Demo Mode</p>
          <p className="text-11 text-black-500 mt-0.5">
            Invoices and Stripe receipts will appear here once billing is connected.
          </p>
        </div>
      </div>

      {/* UPGRADE MODAL */}
      <Modal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Stripe Billing Setup"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-950/20 p-4 text-orange-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-orange-400 mt-0.5" />
            <div className="space-y-1 text-13">
              <p className="font-semibold text-white">
                Stripe is not configured
              </p>
              <p className="leading-relaxed">
                Set <code className="text-white font-mono bg-black-900/60 px-1 rounded">STRIPE_SECRET_KEY</code> and{" "}
                <code className="text-white font-mono bg-black-900/60 px-1 rounded">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in your environment variables to enable live checkouts.
              </p>
            </div>
          </div>

          <p className="text-13 text-black-300 leading-relaxed">
            In this demo environment, all upgrade triggers and billing operations are safely simulated.
          </p>

          <div className="flex justify-end pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(false)}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
