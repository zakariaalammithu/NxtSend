"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Linkedin } from "lucide-react";

/**
 * Pricing page plan cards (mirror: aimfox.com/pricing).
 *
 * The mirror shows a Monthly / Yearly ("up to -25%") billing toggle, but
 * its static HTML only contains the monthly price set ($49 / $499 /
 * $387) — yearly figures are computed by JS on the live site and are not
 * present in the download. The toggle therefore switches selection
 * state only; no yearly prices are invented. Same approach as the
 * homepage pricing section (step 2).
 */
export function PricingCards() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <div>
      {/* Billing cycle toggle (mirror) */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-4 py-1.5 text-13 font-semibold transition-colors ${
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
            className={`rounded-full px-4 py-1.5 text-13 font-semibold transition-colors ${
              billing === "yearly"
                ? "bg-gradient-brand text-white"
                : "font-medium text-black-300"
            }`}
          >
            Yearly <span className="text-green-400">up to -25%</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
        {/* Outreach seat */}
        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-purple-600 bg-black-800/90 p-8 shadow-glow-purple">
          <div>
            <h3 className="text-22 font-bold text-white">Outreach seat</h3>
            <p className="mt-2 text-13 leading-relaxed text-black-400">
              Connect your LinkedIn profiles and start your outreach
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-20 font-bold text-white">$</span>
              <span className="text-44 font-extrabold text-white">49</span>
              <span className="text-14 text-black-400">/ mo</span>
            </div>
            <div className="text-13 text-black-400">per seat</div>

            <Link
              href="/signup"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-brand text-14 font-semibold text-white shadow-glow-purple transition-all duration-200 hover:scale-[1.02]"
            >
              Start your free trial
            </Link>

            <div className="mt-8 border-t border-black-700/80 pt-6">
              <div className="text-13 font-semibold text-white">
                For individuals and teams
              </div>
              <ul className="mt-4 space-y-3">
                <li className="flex items-start gap-2.5 text-13 text-black-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>
                    Seamlessly connect{" "}
                    <Linkedin className="inline h-3.5 w-3.5 text-purple-300" />{" "}
                    accounts
                  </span>
                </li>
                <li className="flex items-start gap-2.5 text-13 text-black-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>
                    Launch inbound &amp; outbound campaigns
                    <span className="mt-1 block text-12 text-black-500">
                      Inbound campaigns are directed towards existing
                      connections, while outbound campaigns target new leads
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2.5 text-13 text-black-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>Unified inbox access</span>
                </li>
                <li className="flex items-start gap-2.5 text-13 text-black-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>3rd party integrations</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Agency */}
        <div className="flex flex-col justify-between rounded-3xl border border-black-700 bg-black-800/50 p-8 transition-all duration-300 hover:border-black-600">
          <div>
            <h3 className="text-22 font-bold text-white">Agency</h3>
            <p className="mt-2 text-13 leading-relaxed text-black-400">
              Built for agencies working with clients&apos; profiles.
            </p>
            <div className="mt-6 text-13 text-black-400">From:</div>
            <div className="flex items-baseline gap-1">
              <span className="text-20 font-bold text-white">$</span>
              <span className="text-44 font-extrabold text-white">499</span>
              <span className="text-14 text-black-400">/ 20 seats</span>
            </div>
            <div className="text-13 text-black-400">+$20 per new seat</div>

            <Link
              href="/demo"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-black-600 bg-black-700 text-14 font-semibold text-white transition-all duration-200 hover:bg-black-600"
            >
              Schedule a call
            </Link>

            <div className="mt-8 border-t border-black-700/80 pt-6">
              <div className="text-13 font-semibold text-white">
                Everything an agency needs
              </div>
              <ul className="mt-4 space-y-3">
                {[
                  "Slack onboarding",
                  "Full whitelabel",
                  "Team collaboration",
                  "Profile migration assistance",
                ].map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-13 text-black-300"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Outreach avatar */}
        <div className="flex flex-col justify-between rounded-3xl border border-black-700 bg-black-800/50 p-8 transition-all duration-300 hover:border-black-600">
          <div>
            <h3 className="text-22 font-bold text-white">Outreach avatar</h3>
            <p className="mt-2 text-13 leading-relaxed text-black-400">
              Scale beyond your limits by renting and customizing LinkedIn
              profiles
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-20 font-bold text-white">$</span>
              <span className="text-44 font-extrabold text-white">387</span>
              <span className="text-14 text-black-400">/ month</span>
            </div>
            <div className="text-13 text-black-400">3 profiles included</div>

            <Link
              href="/avatars"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-black-600 bg-black-700 text-14 font-semibold text-white transition-all duration-200 hover:bg-black-600"
            >
              Grab your avatars
            </Link>

            <div className="mt-8 border-t border-black-700/80 pt-6">
              <div className="text-13 font-semibold text-white">Made to scale</div>
              <ul className="mt-4 space-y-3">
                {[
                  "3x Outreach seat included",
                  "Customization of profiles",
                  "Fast delivery to workspace",
                  "Replacement guarantee",
                ].map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-13 text-black-300"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
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
