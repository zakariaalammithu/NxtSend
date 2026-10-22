import { describe, it, expect } from "vitest";
import {
  checkoutReturnNotice,
  billingUrlWithoutCheckoutParam,
} from "../checkout-return";

describe("checkoutReturnNotice (B2 — the redirect is never proof of payment)", () => {
  it("success says the plan updates on webhook confirmation, not on the redirect", () => {
    const notice = checkoutReturnNotice("success");
    expect(notice?.tone).toBe("success");
    expect(notice?.text).toMatch(/webhook/i);
    expect(notice?.text).toMatch(/redirect by itself never changes a plan/i);
    // Forbidden claims: the redirect alone must never read as paid/active.
    expect(notice?.text).not.toMatch(/payment successful/i);
    expect(notice?.text).not.toMatch(/plan (is )?active/i);
  });

  it("cancelled is neutral and states nothing was charged", () => {
    const notice = checkoutReturnNotice("cancelled");
    expect(notice?.tone).toBe("info");
    expect(notice?.text).toMatch(/nothing was charged/i);
    expect(notice?.text).toMatch(/plan is unchanged/i);
  });

  it("returns null for absent or unknown params", () => {
    expect(checkoutReturnNotice(null)).toBeNull();
    expect(checkoutReturnNotice(undefined)).toBeNull();
    expect(checkoutReturnNotice("")).toBeNull();
    expect(checkoutReturnNotice("failed")).toBeNull();
  });
});

describe("billingUrlWithoutCheckoutParam", () => {
  it("drops only the checkout param and preserves others", () => {
    expect(
      billingUrlWithoutCheckoutParam("/dashboard/billing", "?checkout=success&tab=plans")
    ).toBe("/dashboard/billing?tab=plans");
    expect(
      billingUrlWithoutCheckoutParam("/dashboard/billing", "?checkout=cancelled")
    ).toBe("/dashboard/billing");
    expect(billingUrlWithoutCheckoutParam("/dashboard/billing", "")).toBe(
      "/dashboard/billing"
    );
  });
});
