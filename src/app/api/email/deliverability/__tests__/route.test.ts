import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "../route";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";

/**
 * /api/email/deliverability (P5 Stage D) — demo guard path. Demo
 * aggregates are derived from the seeded demo messages (dated
 * 2024-10), so a WIDE window sees the seed's simulated events and the
 * default 30-day window honestly sees none of them. Classification
 * must say "simulated" — demo numbers never wear a provider label.
 */

function req(url: string): Request {
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("/api/email/deliverability (demo guard path)", () => {
  it("returns the simulated derivation over a wide window", async () => {
    const res = await GET(
      req("http://localhost/api/email/deliverability?days=3650")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(body.classification).toBe("simulated");
    // Seed: msg_demo_003 (opened, cmp_demo_003) + msg_demo_006 (delivered, cmp_demo_001)
    expect(body.totals.counts.sent).toBe(2);
    expect(body.totals.counts.delivered).toBe(2);
    expect(body.totals.counts.opened).toBe(1);
    expect(body.totals.counts.bounced).toBe(0);
    const perCampaign = new Map(
      (body.perCampaign as Array<{ campaignId: string; counts: { opened: number } }>).map(
        (r) => [r.campaignId, r.counts]
      )
    );
    expect(perCampaign.get("cmp_demo_003")?.opened).toBe(1);
    expect(perCampaign.get("cmp_demo_001")?.opened).toBe(0);
  });

  it("the default 30-day window honestly excludes the old seed data", async () => {
    const res = await GET(req("http://localhost/api/email/deliverability"));
    const body = await res.json();
    expect(body.days).toBe(30);
    expect(body.totals.counts.sent).toBe(0);
    expect(body.totals.rates.deliveryRate).toBeNull();
  });

  it("clamps an absurd window instead of erroring", async () => {
    const res = await GET(
      req("http://localhost/api/email/deliverability?days=99999")
    );
    expect(res.status).toBe(200);
    expect((await res.json()).days).toBe(3650);
  });
});
