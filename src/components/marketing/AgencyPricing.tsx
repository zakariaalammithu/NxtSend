"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Briefcase, Check } from "lucide-react";

/**
 * Agency pricing card (mirror: aimfox.com/agency, card id "agency-card").
 *
 * Batch-2 restyle: replaces the plain bordered box with the mirror's
 * WIDE artwork card — card-bg-2 on small screens, the dark card-bg-3
 * aurora from md up (same artwork family as the homepage / avatars
 * pricing cards). Left: plan, "From:" price block and the frosted
 * "Schedule a call" pill; right: the small Monthly/Yearly toggle and
 * the feature list. All copy verbatim from the mirror.
 *
 * The toggle is state-only: the mirror download carries no rendered
 * yearly price for this card, so nothing is invented. The mirror's
 * Calendly link is not carried over — the CTA points at /demo, as
 * elsewhere in this rebuild.
 */

const FEATURES = [
  "Slack onboarding",
  "Full whitelabel",
  "Team collaboration",
  "Profile migration assistance",
] as const;

export function AgencyPricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="mx-auto flex w-full max-w-[61.25rem] flex-col items-center gap-y-8">
      <div className="relative w-full overflow-hidden rounded-6xl border border-white/10 shadow-[0_1px_10px_0_rgba(255,255,255,0.50)_inset]">
        {/* Mirror artwork: card-bg-2 (mobile) / card-bg-3 dark aurora (md+) */}
        <Image
          src="/images/pricing/card-bg-2.webp"
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 980px"
          className="object-cover md:hidden"
        />
        <Image
          src="/images/pricing/card-bg-3.webp"
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 980px"
          className="hidden object-cover md:block"
        />

        <div className="relative flex flex-col p-6 pb-10 md:flex-row md:gap-x-4 md:p-8 md:py-9 xl:gap-x-7">
          {/* Left: plan, price, CTA */}
          <div className="flex flex-col md:w-1/2">
            <div className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" aria-hidden="true" />
              <span className="text-18 font-medium">Agency</span>
            </div>
            <p className="mt-3 w-64 text-15 leading-relaxed text-white/70">
              Built for agencies working with clients&apos; profiles.
            </p>
            <div className="mt-8">
              <span className="text-15 font-medium text-white/70">From:</span>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-48 font-medium leading-none text-white xl:text-54">
                  $499
                </span>
                <span className="flex flex-col items-start gap-1.5">
                  <span className="text-20 font-medium text-white">
                    /20 seats
                  </span>
                  <span className="rounded-full bg-black-900 px-2.5 py-1 text-12 font-semibold text-white">
                    +$20 per new seat
                  </span>
                </span>
              </div>
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
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black-900/40 p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  aria-pressed={billing === "monthly"}
                  className={`cursor-pointer rounded-full px-3 py-1 text-11 ${
                    billing === "monthly"
                      ? "bg-black-900 font-bold text-white ring-1 ring-white/20"
                      : "font-semibold text-white/70"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("yearly")}
                  aria-pressed={billing === "yearly"}
                  className={`cursor-pointer rounded-full px-3 py-1 text-11 ${
                    billing === "yearly"
                      ? "bg-black-900 font-bold text-white ring-1 ring-white/20"
                      : "font-semibold text-white/70"
                  }`}
                >
                  Yearly
                </button>
              </span>
            </div>

            <div className="mt-6 text-18 font-bold text-white">
              Everything an agency needs
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
