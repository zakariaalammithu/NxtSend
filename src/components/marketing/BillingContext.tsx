"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { BillingCycle } from "@/lib/marketing-prices";

/**
 * Shared Monthly/Yearly billing state for one page.
 *
 * The pricing page wraps both the plan cards (PricingCards) and the
 * comparison table in this provider so every toggle on the page — the
 * main toggle, the avatar card's mini toggle and the table header's
 * "Choose how you pay" control — flips all displayed prices together.
 * Renders no DOM element of its own.
 */

interface BillingContextValue {
  billing: BillingCycle;
  setBilling: (billing: BillingCycle) => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  return (
    <BillingContext.Provider value={{ billing, setBilling }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used within a BillingProvider");
  }
  return ctx;
}
