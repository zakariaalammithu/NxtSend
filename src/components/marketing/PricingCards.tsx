"use client";

import Link from "next/link";
import Image from "next/image";
import { Check, Linkedin, Zap, Briefcase, Gem } from "lucide-react";
import {
  AGENCY_EXTRA_SEAT_PRICES,
  AGENCY_PRICES,
  AVATAR_PRICES,
  SEAT_PRICES,
  formatAnnualTotal,
  formatPrice,
  priceFor,
} from "@/lib/marketing-prices";
import { useBilling } from "./BillingContext";
import { BillingToggle } from "./BillingToggle";

/**
 * Pricing page plan cards (mirror: aimfox.com/pricing).
 *
 * Layout and card treatment match the homepage pricing section: two
 * artwork cards on top (Outreach seat, Agency) over the mirror's
 * aurora backgrounds (public/images/pricing/card-bg-1/2.webp) and one
 * wide artwork card below (Outreach avatar, card-bg-3).
 *
 * Prices come from the shared model in src/lib/marketing-prices.ts.
 * The Monthly / Yearly toggle ("up to -25%") switches every figure on
 * the page: billing state lives in the page-level BillingProvider, so
 * this main toggle, the avatar card's mini toggle and the comparison
 * table header all flip together. Yearly mode shows the exact
 * monthly-equivalent figure plus a "billed annually" caption with the
 * annual total.
 */
export function PricingCards() {
  const { billing, setBilling } = useBilling();
  const yearly = billing === "yearly";

  return (
    <div>
      {/* Billing cycle toggle (mirror) */}
      <div className="flex justify-center">
        <BillingToggle billing={billing} onChange={setBilling} />
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Outreach seat */}
        <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10">
          <Image
            src="/images/pricing/card-bg-1.webp"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 500px"
            className="object-cover"
          />
          <div className="relative flex h-full flex-col p-8">
            <div className="flex items-center gap-2 text-white">
              <Zap className="h-5 w-5 fill-white" />
              <h3 className="text-17 font-semibold">Outreach seat</h3>
            </div>
            <p className="mt-3 max-w-[260px] text-14 leading-relaxed text-white/70">
              Link your own LinkedIn accounts and run outreach from one
              workspace
            </p>
            <div className="mt-7 flex flex-wrap items-end gap-x-2.5 gap-y-2">
              <span className="text-54 font-semibold leading-none text-white">
                {formatPrice(priceFor(SEAT_PRICES, billing))}
              </span>
              <span className="pb-1 text-15 text-white/60">/mo</span>
              <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                per seat
              </span>
            </div>
            {yearly && (
              <p className="mt-3 text-13 text-white/60">
                Billed annually — {formatAnnualTotal(SEAT_PRICES.yearlyTotal)}
                /year
              </p>
            )}

            <Link
              href="/signup"
              className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
            >
              Try NxtSend free
            </Link>

            <div className="mt-9">
              <div className="text-15 font-bold text-white">
                Made for solo senders and small teams
              </div>
              <ul className="mt-4 space-y-3">
                <li className="flex items-start gap-2.5 text-14 text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>
                    Connect your{" "}
                    <Linkedin className="inline h-3.5 w-3.5 text-white" />{" "}
                    accounts in a few clicks
                  </span>
                </li>
                <li className="flex items-start gap-2.5 text-14 text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>
                    Run campaigns to new prospects and existing connections
                    <span className="mt-1 block text-12 leading-relaxed text-white/50">
                      Outbound reaches people you have not connected with
                      yet, while inbound focuses on contacts already in
                      your network
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2.5 text-14 text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>Every reply in one unified inbox</span>
                </li>
                <li className="flex items-start gap-2.5 text-14 text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span>Connect the tools you already use</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Agency */}
        <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10">
          <Image
            src="/images/pricing/card-bg-2.webp"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 500px"
            className="object-cover"
          />
          <div className="relative flex h-full flex-col p-8">
            <div className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" />
              <h3 className="text-17 font-semibold">Agency</h3>
            </div>
            <p className="mt-3 max-w-[260px] text-14 leading-relaxed text-white/70">
              Run outreach for multiple clients without juggling separate
              logins.
            </p>
            <div className="mt-7">
              <div className="text-13 text-white/60">From:</div>
              <div className="mt-1 flex flex-wrap items-end gap-x-2.5 gap-y-2">
                <span className="text-54 font-semibold leading-none text-white">
                  {formatPrice(priceFor(AGENCY_PRICES, billing))}
                </span>
                <span className="pb-1 text-15 text-white/60">/20 seats</span>
                <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                  +{formatPrice(priceFor(AGENCY_EXTRA_SEAT_PRICES, billing))}{" "}
                  per new seat
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
              className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
            >
              Talk to our team
            </Link>

            <div className="mt-9">
              <div className="text-15 font-bold text-white">
                What agencies get included
              </div>
              <ul className="mt-4 space-y-3">
                {[
                  "Onboarding help over Slack",
                  "White-label the client experience",
                  "Work together across client accounts",
                  "Help moving existing profiles over",
                ].map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-14 text-white/85"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Outreach avatar — wide card */}
        <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10 lg:col-span-2">
          <Image
            src="/images/pricing/card-bg-3.webp"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
          />
          <div className="relative grid gap-8 p-8 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Gem className="h-5 w-5" />
                <h3 className="text-17 font-semibold">Outreach avatar</h3>
              </div>
              <p className="mt-3 max-w-[280px] text-14 leading-relaxed text-white/70">
                Add ready-to-use LinkedIn profiles when your own accounts
                reach their limits
              </p>
              <div className="mt-7 flex flex-wrap items-end gap-x-2.5 gap-y-2">
                <span className="text-54 font-semibold leading-none text-white">
                  {formatPrice(priceFor(AVATAR_PRICES, billing))}
                </span>
                <span className="pb-1 text-15 text-white/60">/month</span>
                <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                  3 profiles included
                </span>
              </div>
              {yearly && (
                <p className="mt-3 text-13 text-white/60">
                  {formatAnnualTotal(AVATAR_PRICES.yearlyTotal)} billed
                  annually
                </p>
              )}
              <Link
                href="/avatars"
                className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
              >
                Explore avatars
              </Link>
            </div>

            <div className="md:pt-1">
              <div className="flex md:justify-end">
                <BillingToggle
                  size="sm"
                  billing={billing}
                  onChange={setBilling}
                />
              </div>
              <div className="mt-6 text-15 font-bold text-white">
                Built to add capacity
              </div>
              <ul className="mt-4 space-y-3">
                <li className="flex items-start gap-2.5 text-14 text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-13 font-medium text-white">
                    Includes 3 Outreach seats
                  </span>
                </li>
                {[
                  "Profiles tailored to your niche",
                  "Delivered straight into your workspace",
                  "Replacement guarantee included",
                ].map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-14 text-white/85"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
