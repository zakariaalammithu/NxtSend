"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Gem } from "lucide-react";

/**
 * Avatars pricing card (mirror: aimfox.com/avatars, card id "rental-card").
 *
 * Batch-2 restyle: the card follows the mirror's own construction — a
 * WIDE aurora artwork card (card-bg-2 on small screens, the dark
 * card-bg-3 aurora from md up, the same artwork family as the homepage
 * pricing cards), price block on the left, "Made to scale" features and
 * the small Monthly/Yearly toggle on the right. Content is verbatim
 * from the mirror.
 *
 * The Monthly/Yearly toggle is state-only: the mirror download carries
 * no rendered yearly price for this card, so nothing is invented.
 */

const FEATURES = [
  "Customization of profiles",
  "Fast delivery to workspace",
  "Replacement guarantee",
] as const;

export function AvatarsPricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="mx-auto flex w-full max-w-[61.25rem] flex-col gap-y-8">
      <div className="relative overflow-hidden rounded-6xl border border-white/10 shadow-[0_1px_10px_0_rgba(255,255,255,0.50)_inset]">
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
              <Gem className="h-5 w-5" aria-hidden="true" />
              <span className="text-18 font-medium">Outreach avatar</span>
            </div>
            <p className="mt-3 w-64 text-15 leading-relaxed text-white/70">
              Scale beyond your limits by renting and customizing LinkedIn
              profiles
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <span className="text-48 font-medium leading-none text-white xl:text-54">
                $387
              </span>
              <span className="self-end pb-1 text-15 font-semibold text-white/70">
                /month
              </span>
              <span className="rounded-full bg-black-900 px-3 py-1 text-14 font-semibold text-white">
                3 profiles included
              </span>
            </div>
            <Link
              href="/signup"
              className="mt-auto flex h-12.5 w-full items-center justify-center rounded-full bg-black-900 text-15 font-semibold text-white transition-colors hover:bg-black-800 md:mt-10"
            >
              Grab your avatars
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
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-11 ${
                    billing === "yearly"
                      ? "bg-black-900 font-bold text-white ring-1 ring-white/20"
                      : "font-semibold text-white/70"
                  }`}
                >
                  Yearly
                  <span className="rounded-full bg-purple-600 px-1.5 py-px text-9 font-bold text-white">
                    up to -25%
                  </span>
                </button>
              </span>
            </div>

            <div className="mt-6 text-15 font-bold text-white">
              Made to scale
            </div>
            <ul className="mt-4 space-y-3">
              <li className="flex items-center gap-2.5 text-15 text-white/85">
                <Check
                  className="h-4 w-4 shrink-0 text-white"
                  aria-hidden="true"
                />
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-14 font-medium text-white">
                  3x Outreach seat included
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
