import { describe, it, expect } from "vitest";
import { planLimits } from "@/lib/utils";
import type { PlanType } from "@/types";

const TIERS: PlanType[] = ["free", "starter", "growth", "agency"];

describe("planLimits", () => {
  it("defines limits for every plan tier", () => {
    for (const tier of TIERS) {
      expect(planLimits[tier]).toBeDefined();
      expect(planLimits[tier].leads).toBeGreaterThan(0);
      expect(planLimits[tier].campaigns).toBeGreaterThan(0);
      expect(planLimits[tier].accounts).toBeGreaterThan(0);
      expect(planLimits[tier].emailsPerMonth).toBeGreaterThan(0);
    }
  });

  it("is monotonically increasing across tiers for every resource", () => {
    for (let i = 1; i < TIERS.length; i++) {
      const prev = planLimits[TIERS[i - 1]];
      const next = planLimits[TIERS[i]];
      expect(next.leads).toBeGreaterThan(prev.leads);
      expect(next.campaigns).toBeGreaterThan(prev.campaigns);
      expect(next.accounts).toBeGreaterThan(prev.accounts);
      expect(next.emailsPerMonth).toBeGreaterThan(prev.emailsPerMonth);
    }
  });

  it("matches the documented free-tier limits", () => {
    expect(planLimits.free).toEqual({
      leads: 500,
      campaigns: 3,
      accounts: 1,
      emailsPerMonth: 1000,
    });
  });
});
