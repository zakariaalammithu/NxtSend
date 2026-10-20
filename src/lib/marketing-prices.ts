/**
 * Shared price model for the marketing surfaces (homepage pricing
 * section, /pricing cards + comparison-table header, /avatars and
 * /agency pricing cards).
 *
 * Monthly figures are the long-standing advertised prices. Yearly
 * billing applies the discount the site already advertises on every
 * toggle badge ("up to -25%"): the annual total is exactly 9 monthly
 * payments (12 × 0.75), and the monthly-equivalent is that total
 * divided by 12. All values are exact — nothing is rounded in the
 * model; formatting helpers decide how a figure is displayed.
 */

export type BillingCycle = "monthly" | "yearly";

export interface PlanPrices {
  /** Price per month when billed monthly. */
  monthly: number;
  /** Per-month equivalent when billed yearly (yearlyTotal / 12). */
  yearlyMonthlyEq: number;
  /** Total charged once per year on yearly billing. */
  yearlyTotal: number;
  /** Saving over 12 monthly payments (monthly × 12 − yearlyTotal). */
  savePerYear: number;
}

/** Outreach seat — $49/mo per seat. */
export const SEAT_PRICES: PlanPrices = {
  monthly: 49,
  yearlyMonthlyEq: 36.75,
  yearlyTotal: 441,
  savePerYear: 147,
};

/** Agency — $499/mo for 20 seats included. */
export const AGENCY_PRICES: PlanPrices = {
  monthly: 499,
  yearlyMonthlyEq: 374.25,
  yearlyTotal: 4491,
  savePerYear: 1497,
};

/** Agency — each additional seat beyond the included 20. */
export const AGENCY_EXTRA_SEAT_PRICES: PlanPrices = {
  monthly: 20,
  yearlyMonthlyEq: 15,
  yearlyTotal: 180,
  savePerYear: 60,
};

/** Outreach avatar — $387/mo, 3 profiles included. */
export const AVATAR_PRICES: PlanPrices = {
  monthly: 387,
  yearlyMonthlyEq: 290.25,
  yearlyTotal: 3483,
  savePerYear: 1161,
};

/** The per-month figure to display for a plan in a given cycle. */
export function priceFor(plan: PlanPrices, billing: BillingCycle): number {
  return billing === "yearly" ? plan.yearlyMonthlyEq : plan.monthly;
}

/**
 * Format a headline price figure: whole dollars without decimals
 * ("$49", "$15"), exact cents when the figure has them ("$36.75").
 */
export function formatPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/** Format an annual total with a thousands separator ("$4,491"). */
export function formatAnnualTotal(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}
