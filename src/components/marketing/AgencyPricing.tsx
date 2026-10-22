"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Check } from "lucide-react";
import { AuroraBg } from "./AuroraBg";
import {
  AGENCY_EXTRA_SEAT_PRICES,
  AGENCY_PRICES,
  formatAnnualTotal,
  formatPrice,
  priceFor,
  type BillingCycle,
} from "@/lib/marketing-prices";
import { BillingToggle } from "./BillingToggle";

/**
 * Agency pricing card.
 *
 * Batch-2 restyle: replaces the plain bordered box with a WIDE
 * aurora card — the "agency" CSS aurora on small screens, the dark
 * "avatar" aurora from md up (see AuroraBg; same family as the
 * homepage / avatars pricing cards). Left: plan, "From:" price
 * block and the frosted "Schedule a call" pill; right: the small
 * Monthly/Yearly toggle and the feature list. Copy rewritten
 * originally for NxtSend in Phase-2 Stage 2; structure is
 * unchanged. No external booking link is carried over — the CTA
 * points at /demo, as elsewhere in this rebuild.
 *
 * Prices come from the shared model in src/lib/marketing-prices.ts:
 * monthly renders the long-standing figures; yearly shows the exact
 * monthly-equivalents at the advertised -25% plus a "billed annually"
 * caption covering the plan total and the extra-seat rate.
 */

const FEATURES = [
  "Guided onboarding over Slack",
  "Complete white-label setup",
  "Shared access for your team",
  "Help migrating existing profiles",
] as const;

export function AgencyPricing() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const yearly = billing === "yearly";

  return (
    <div className="mx-auto flex w-full max-w-[61.25rem] flex-col items-center gap-y-8">
      <div className="relative w-full overflow-hidden rounded-6xl border border-white/10 shadow-[0_1px_10px_0_rgba(255,255,255,0.50)_inset]">
        {/* Aurora background: agency gradient (mobile) / avatar
            gradient (md+) */}
        <AuroraBg variant="agency" className="md:hidden" />
        <AuroraBg variant="avatar" className="hidden md:block" />

        <div className="relative flex flex-col p-6 pb-10 md:flex-row md:gap-x-4 md:p-8 md:py-9 xl:gap-x-7">
          {/* Left: plan, price, CTA */}
          <div className="flex flex-col md:w-1/2">
            <div className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" aria-hidden="true" />
              <span className="text-18 font-medium">Agency</span>
            </div>
            <p className="mt-3 w-64 text-15 leading-relaxed text-white/70">
              For agencies managing outreach across client accounts.
            </p>
            <div className="mt-8">
              <span className="text-15 font-medium text-white/70">From:</span>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-48 font-medium leading-none text-white xl:text-54">
                  {formatPrice(priceFor(AGENCY_PRICES, billing))}
                </span>
                <span className="flex flex-col items-start gap-1.5">
                  <span className="text-20 font-medium text-white">
                    /20 seats
                  </span>
                  <span className="rounded-full bg-black-900 px-2.5 py-1 text-12 font-semibold text-white">
                    +{formatPrice(priceFor(AGENCY_EXTRA_SEAT_PRICES, billing))}{" "}
                    per new seat
                  </span>
                </span>
              </div>
              {yearly && (
                <p className="mt-3 text-13 text-white/60">
                  {formatAnnualTotal(AGENCY_PRICES.yearlyTotal)} billed
                  annually · extra seats{" "}
                  {formatPrice(AGENCY_EXTRA_SEAT_PRICES.yearlyMonthlyEq)}/mo
                  billed annually
                </p>
              )}
            </div>
            <Link
              href="/demo"
              className="mt-auto flex h-12.5 w-full items-center justify-center rounded-full border border-white/15 bg-black/20 text-15 font-semibold text-white shadow-[inset_-4px_-4px_12px_0_rgba(255,255,255,0.08),inset_4px_4px_20px_0_rgba(255,255,255,0.25),0_4px_20px_0_rgba(0,0,0,0.25)] backdrop-blur-md transition-colors hover:bg-black/30 md:mt-10"
            >
              Schedule a call
            </Link>
          </div>

          {/* Right: toggle + features */}
          <div className="mt-10 flex flex-col md:mt-0 md:flex-1">
            <div className="flex md:justify-end">
              <BillingToggle
                size="sm"
                badge={false}
                billing={billing}
                onChange={setBilling}
              />
            </div>

            <div className="mt-6 text-18 font-bold text-white">
              What the plan includes
            </div>
            <ul className="mt-4 space-y-3">
              {FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2.5 text-15 font-medium text-white/85"
                >
                  <Check
                    className="h-4 w-4 shrink-0 text-white"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Link
        href="/pricing"
        className="group inline-flex items-center justify-center gap-2 rounded-full border border-black-600 bg-black-800 px-6 py-3 text-14 font-bold text-white transition-colors hover:border-purple-500/50"
      >
        View all features
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
