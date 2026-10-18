"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Avatars pricing block (mirror: aimfox.com/avatars).
 *
 * Unlike /pricing, the avatars page shows a single wide "Outreach
 * avatar" card (card-bg-2 artwork) with the billing toggle repeated
 * inside the card's feature column. All copy and figures are verbatim
 * from the mirror: $387/month, "3 profiles included", "Made to scale"
 * features. The mirror's serialized state also carries a yearly price
 * (3870) that its static HTML never renders, so — exactly as on the
 * homepage and /pricing — the toggle switches selection state only and
 * no yearly figure is displayed. The mirror's "Grab your avatars"
 * button points at an Aimfox Calendly link; it maps to /demo, as the
 * "Schedule a call" button does on /pricing.
 */
export function AvatarsPricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const toggle = (small: boolean) => (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 ${
        small ? "p-0.5" : "p-1"
      }`}
    >
      <button
        type="button"
        onClick={() => setBilling("monthly")}
        className={`rounded-full font-semibold transition-colors ${
          small ? "px-4 py-1 text-14" : "px-5 py-1.5 text-16"
        } ${
          billing === "monthly"
            ? "bg-gradient-brand text-white"
            : "font-medium text-black-300"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setBilling("yearly")}
        className={`rounded-full font-semibold transition-colors ${
          small ? "px-4 py-1 text-14" : "px-5 py-1.5 text-16"
        } ${
          billing === "yearly"
            ? "bg-gradient-brand text-white"
            : "font-medium text-black-300"
        }`}
      >
        Yearly{" "}
        <span className="ml-1 rounded-full bg-purple-500 px-1.5 py-0.5 text-12 font-medium text-white">
          up to -25%
        </span>
      </button>
    </div>
  );

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-y-8">
      {toggle(false)}

      {/* Outreach avatar card (mirror: single rental plan card) */}
      <div
        className="w-full rounded-[2.5rem] border border-white/10 bg-cover bg-no-repeat p-1.5 pb-10"
        style={{
          backgroundImage: "url(/images/pricing/card-bg-2.webp)",
        }}
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-col px-4 py-3 md:w-1/2 md:py-4">
            <div className="mb-6 flex items-center gap-x-2 text-18 font-medium text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 20 20"
                className="size-5"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M13.743 3c.266 0 .53.064.77.188s.453.304.62.527l2.529 3.405c.233.32.353.718.337 1.124a1.77 1.77 0 0 1-.424 1.09l-6.51 7.405a.8.8 0 0 1-.26.193.74.74 0 0 1-.878-.193L3.425 9.333A1.77 1.77 0 0 1 3 8.244a1.8 1.8 0 0 1 .337-1.124l2.528-3.405c.168-.223.38-.403.62-.527.241-.123.504-.188.77-.188zm.51 5.454a.563.563 0 0 0-.839 0l-1.667 1.796a.674.674 0 0 0 0 .903c.231.25.607.25.838 0l1.667-1.796a.675.675 0 0 0 0-.903"
                />
              </svg>
              <span>Outreach avatar</span>
            </div>
            <p className="mb-5 w-64 text-white/70">
              Scale beyond your limits by renting and customizing LinkedIn
              profiles
            </p>
            <div className="flex items-end gap-x-2.5">
              <span className="text-48 font-medium text-white xl:text-54">
                $387
              </span>
              <div className="flex flex-col items-start gap-y-1.5 pb-2">
                <span className="text-20 font-medium text-black-400">
                  /month
                </span>
                <span className="rounded-full bg-black px-2 py-1 text-15 font-medium text-white">
                  3 profiles included
                </span>
              </div>
            </div>

            <Link
              href="/demo"
              className="mt-8 flex h-12 w-fit items-center justify-center rounded-full bg-black-900 px-6 text-16 font-semibold text-white transition-colors hover:bg-black-600"
            >
              Grab your avatars
            </Link>
          </div>

          <div className="flex flex-1 flex-col gap-y-2 px-4 pt-6 md:pt-3">
            {toggle(true)}
            <div className="mt-4 flex flex-col text-white">
              <p className="mb-4 text-18 font-bold md:mb-6">Made to scale</p>
              <ul>
                {[
                  "3x Outreach seat included",
                  "Customization of profiles",
                  "Fast delivery to workspace",
                  "Replacement guarantee",
                ].map((feat, i) => (
                  <li
                    key={feat}
                    className="mb-3 flex items-center text-15 font-medium last:mb-0"
                  >
                    <Check className="mr-3 h-4 w-4 shrink-0 text-white" />
                    {i === 0 ? (
                      <span className="rounded-xl bg-white/10 px-1.5 py-1">
                        {feat}
                      </span>
                    ) : (
                      <span>{feat}</span>
                    )}
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
