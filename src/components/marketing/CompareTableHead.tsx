"use client";

import Link from "next/link";
import {
  AGENCY_PRICES,
  AVATAR_PRICES,
  SEAT_PRICES,
  formatPrice,
  priceFor,
  type BillingCycle,
} from "@/lib/marketing-prices";
import { useBilling } from "./BillingContext";

/**
 * Pricing comparison table header (client component).
 *
 * The "Choose how you pay" control is a real toggle wired to the
 * page-level BillingProvider — the same state the plan cards use — so
 * flipping it here (or on either card toggle) updates the three plan
 * price lines in this header and every card figure together. Yearly
 * lines show the monthly-equivalent figure from
 * src/lib/marketing-prices.ts plus a "billed annually" note. Monthly
 * lines render exactly the long-standing strings.
 */

const TOGGLE_ACTIVE =
  "rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white";
const TOGGLE_INACTIVE =
  "rounded-full px-4 py-1.5 text-13 font-medium text-black-300";

function priceLine(
  plan: typeof SEAT_PRICES,
  billing: BillingCycle,
  format: (figure: string) => string,
): string {
  const base = format(formatPrice(priceFor(plan, billing)));
  return billing === "yearly" ? `${base}, billed annually` : base;
}

export function CompareTableHead() {
  const { billing, setBilling } = useBilling();

  return (
    <thead>
      <tr className="border-b border-black-700 bg-black-900/80 align-top text-white">
        <th className="w-2/5 p-5 sm:p-6">
          <p className="text-14 font-medium text-black-400">
            Choose how you pay
          </p>
          <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              aria-pressed={billing === "monthly"}
              className={
                billing === "monthly" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
              }
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              aria-pressed={billing === "yearly"}
              className={
                billing === "yearly" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
              }
            >
              Yearly <span className="text-green-400">up to -25%</span>
            </button>
          </div>
        </th>
        <th className="w-[20%] p-5 sm:p-6">
          <div className="text-18 font-semibold">Outreach seat</div>
          <p className="mt-1 text-13 font-medium text-black-400">
            {priceLine(SEAT_PRICES, billing, (f) => `${f} per seat / month`)}
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
          >
            Try it free
          </Link>
        </th>
        <th className="w-[20%] p-5 sm:p-6">
          <div className="text-18 font-semibold">Outreach avatar</div>
          <p className="mt-1 text-13 font-medium text-black-400">
            {priceLine(AVATAR_PRICES, billing, (f) => `${f} per profile / month`)}
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
          >
            Rent an avatar
          </Link>
        </th>
        <th className="w-[20%] p-5 sm:p-6">
          <div className="text-18 font-semibold">Agency</div>
          <p className="mt-1 text-13 font-medium text-black-400">
            {priceLine(
              AGENCY_PRICES,
              billing,
              (f) => `from ${f} for 20 seats / month`,
            )}
          </p>
          <Link
            href="/demo"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
          >
            Book a call
          </Link>
        </th>
      </tr>
    </thead>
  );
}
