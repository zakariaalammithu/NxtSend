"use client";

import type { BillingCycle } from "@/lib/marketing-prices";

/**
 * Monthly / Yearly billing toggle used by every marketing pricing
 * surface. Two sizes mirror the established designs: "lg" for the
 * section-level toggle above the plan cards, "sm" for the mini toggle
 * inside the wide avatar/agency cards. The control is always a real
 * button pair wired to the caller's billing state — never a display
 * look-alike. Yearly carries the standing "up to -25%" badge except
 * where a card's established design has none (AgencyPricing).
 */

interface BillingToggleProps {
  billing: BillingCycle;
  onChange: (billing: BillingCycle) => void;
  size?: "lg" | "sm";
  badge?: boolean;
}

const ACTIVE = "bg-black-900 font-bold text-white ring-1 ring-white/20";
const INACTIVE = "font-semibold text-white/70";

export function BillingToggle({
  billing,
  onChange,
  size = "lg",
  badge = true,
}: BillingToggleProps) {
  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black-900/40 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          aria-pressed={billing === "monthly"}
          className={`cursor-pointer rounded-full px-3 py-1 text-11 ${
            billing === "monthly" ? ACTIVE : INACTIVE
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange("yearly")}
          aria-pressed={billing === "yearly"}
          className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-11 ${
            billing === "yearly" ? ACTIVE : INACTIVE
          }`}
        >
          Yearly
          {badge && (
            <span className="rounded-full bg-purple-600 px-1.5 py-px text-9 font-bold text-white">
              up to -25%
            </span>
          )}
        </button>
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black-800 p-1">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        aria-pressed={billing === "monthly"}
        className={`rounded-full px-4 py-1.5 text-13 transition-colors ${
          billing === "monthly" ? ACTIVE : INACTIVE
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("yearly")}
        aria-pressed={billing === "yearly"}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-13 transition-colors ${
          billing === "yearly" ? ACTIVE : INACTIVE
        }`}
      >
        Yearly
        {badge && (
          <span className="rounded-full bg-purple-600 px-2 py-0.5 text-10 font-bold text-white">
            up to -25%
          </span>
        )}
      </button>
    </div>
  );
}
