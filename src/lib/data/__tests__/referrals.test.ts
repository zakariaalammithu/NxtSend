import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  buildReferralLink,
  parseReferralCode,
  validateReferralCapture,
  REFERRAL_STORAGE_KEY,
} from "@/lib/referrals/core";
import { createReferralsRepository } from "@/lib/data/referrals";
import { DEMO_USER_ID } from "@/lib/data/workspace";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("referral core", () => {
  it("builds a signup link carrying the referrer id", () => {
    expect(buildReferralLink("https://nxtsend.example/", "usr_123")).toBe(
      "https://nxtsend.example/signup?ref=usr_123"
    );
    expect(buildReferralLink("", "usr_123")).toBe("/signup?ref=usr_123");
  });

  it("parses the ref param from query strings", () => {
    expect(parseReferralCode("?ref=usr_9&x=1")).toBe("usr_9");
    expect(parseReferralCode("ref=usr_7")).toBe("usr_7");
    expect(parseReferralCode(new URLSearchParams("ref=usr_5"))).toBe("usr_5");
    expect(parseReferralCode("?x=1")).toBeNull();
    expect(parseReferralCode("?ref=ab")).toBeNull(); // below sanity bounds
    expect(parseReferralCode(null)).toBeNull();
    expect(REFERRAL_STORAGE_KEY).toBe("nxtsend_ref_code");
  });

  it("validateReferralCapture blocks self-referrals and empty codes", () => {
    expect(validateReferralCapture({ code: null, newUserId: "usr_1" })).toEqual({
      ok: false,
      reason: "missing_code",
    });
    expect(
      validateReferralCapture({ code: "usr_1", newUserId: "usr_1" })
    ).toEqual({ ok: false, reason: "self_referral" });
    expect(
      validateReferralCapture({ code: "usr_2", newUserId: "usr_1" })
    ).toEqual({ ok: true });
  });
});

describe("DemoReferralsRepository", () => {
  it("returns labelled demo records for the demo persona only", async () => {
    const repo = createReferralsRepository("demo");
    const records = await repo.listReferrals(DEMO_USER_ID);
    expect(records.length).toBeGreaterThan(0);
    // Every seeded record is explicitly demo data — never passed off
    // as a real signup.
    expect(records.every((r) => r.is_demo)).toBe(true);
    expect(
      records.filter((r) => r.status === "signed_up").length
    ).toBeGreaterThan(0);

    expect(await repo.listReferrals("usr_someone_else")).toEqual([]);
  });
});
