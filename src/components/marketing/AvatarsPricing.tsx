"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Gem } from "lucide-react";
import { AuroraBg } from "./AuroraBg";
import {
  AVATAR_PRICES,
  formatAnnualTotal,
  formatPrice,
  priceFor,
  type BillingCycle,
} from "@/lib/marketing-prices";
import { BillingToggle } from "./BillingToggle";

/**
 * Avatars pricing card.
 *
 * Construction — a WIDE aurora card (the "agency" CSS aurora on
 * small screens, the dark "avatar" aurora from md up; see AuroraBg —
 * the same family as the homepage pricing cards), price block on
 * the left, features and the small Monthly/Yearly toggle on the
 * right. Phase-2 branding: card copy rewritten originally for
 * NxtSend.
 *
 * Prices come from the shared model in src/lib/marketing-prices.ts:
 * monthly renders the long-standing figure; yearly shows the exact
 * monthly-equivalent at the advertised -25% plus a "billed annually"
 * caption with the annual total.
 */

const FEATURES = [
  "Profiles personalized to your brief",
  "Setup and warm-up handled for you",
  "Support if a profile needs attention",
] as const;

export function AvatarsPricing() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const yearly = billing === "yearly";

  return (
    <div className="mx-auto flex w-full max-w-[61.25rem] flex-col gap-y-8">
      <div className="relative overflow-hidden rounded-6xl border border-white/10 shadow-[0_1px_10px_0_rgba(255,255,255,0.50)_inset]">
        {/* Aurora background: agency gradient (mobile) / avatar
            gradient (md+) */}
        <AuroraBg variant="agency" className="md:hidden" />
        <AuroraBg variant="avatar" className="hidden md:block" />

        <div className="relative flex flex-col p-6 pb-10 md:flex-row md:gap-x-4 md:p-8 md:py-9 xl:gap-x-7">
          {/* Left: plan, price, CTA */}
          <div className="flex flex-col md:w-1/2">
            <div className="flex items-center gap-2 text-white">
              <Gem className="h-5 w-5" aria-hidden="true" />
              <span className="text-18 font-medium">Outreach Avatars</span>
            </div>
            <p className="mt-3 w-64 text-15 leading-relaxed text-white/70">
              Add prepared LinkedIn profiles you can personalize and run
              alongside your existing accounts
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <span className="text-48 font-medium leading-none text-white xl:text-54">
                {formatPrice(priceFor(AVATAR_PRICES, billing))}
              </span>
              <span className="self-end pb-1 text-15 font-semibold text-white/70">
                /month
              </span>
              <span className="rounded-full bg-black-900 px-3 py-1 text-14 font-semibold text-white">
                3 profiles included
              </span>
            </div>
            {yearly && (
              <p className="mt-3 text-13 text-white/60">
                {formatAnnualTotal(AVATAR_PRICES.yearlyTotal)} billed annually
              </p>
            )}
            <Link
              href="/signup"
              className="mt-auto flex h-12.5 w-full items-center justify-center rounded-full bg-black-900 text-15 font-semibold text-white transition-colors hover:bg-black-800 md:mt-10"
            >
              Get your avatars
            </Link>
          </div>

          {/* Right: toggle + features */}
          <div className="mt-10 flex flex-col md:mt-0 md:flex-1">
            <div className="flex md:justify-end">
              <BillingToggle
                size="sm"
                billing={billing}
                onChange={setBilling}
              />
            </div>

            <div className="mt-6 text-15 font-bold text-white">
              Built to grow with you
            </div>
            <ul className="mt-4 space-y-3">
              <li className="flex items-center gap-2.5 text-15 text-white/85">
                <Check
                  className="h-4 w-4 shrink-0 text-white"
                  aria-hidden="true"
                />
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-14 font-medium text-white">
                  3 outreach seats included
                </span>
              </li>
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
    </div>
  );
}
