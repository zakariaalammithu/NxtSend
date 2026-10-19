import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  buildUsageChecks,
  buildWorkspaceUsage,
  currentPeriodStart,
  createUsageRepository,
  DEMO_WORKSPACE_PLAN,
} from "@/lib/data/usage";
import { createLeadsRepository } from "@/lib/data/leads";
import { createCampaignsRepository } from "@/lib/data/campaigns";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { planLimits } from "@/lib/utils";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("currentPeriodStart", () => {
  it("returns the first day of the month (YYYY-MM-01, UTC)", () => {
    expect(currentPeriodStart(new Date("2026-10-19T04:10:00Z"))).toBe("2026-10-01");
    expect(currentPeriodStart(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("buildUsageChecks", () => {
  it("computes used/limit/percent/remaining from real counts", () => {
    const checks = buildUsageChecks("growth", {
      leads: 250,
      campaigns: 5,
      emailsPerMonth: 1000,
    });
    const limits = planLimits.growth;
    expect(checks).toHaveLength(3);

    const leads = checks.find((c) => c.metric === "leads")!;
    expect(leads.used).toBe(250);
    expect(leads.limit).toBe(limits.leads);
    expect(leads.percentUsed).toBe(Math.round((250 / limits.leads) * 100));
    expect(leads.remaining).toBe(limits.leads - 250);
    expect(leads.allowed).toBe(true);

    const emails = checks.find((c) => c.metric === "emailsPerMonth")!;
    expect(emails.used).toBe(1000);
    expect(emails.limit).toBe(limits.emailsPerMonth);
  });

  it("flags over-limit and clamps remaining at zero", () => {
    const checks = buildUsageChecks("free", {
      leads: 9999,
      campaigns: 0,
      emailsPerMonth: 0,
    });
    const leads = checks.find((c) => c.metric === "leads")!;
    expect(leads.allowed).toBe(false);
    expect(leads.remaining).toBe(0);
    expect(leads.percentUsed).toBe(100); // clamped for display
  });

  it("only includes metrics that have a real source", () => {
    const checks = buildUsageChecks("growth", { leads: 3 });
    expect(checks.map((c) => c.metric)).toEqual(["leads"]);
  });

  it("has NO credits metric and NO balance anywhere", () => {
    const usage = buildWorkspaceUsage({
      workspace_id: "ws",
      plan: "growth",
      period_start: "2026-10-01",
      source: "computed",
      metrics: { leads: 1, campaigns: 1, emailsPerMonth: 1 },
    });
    expect(usage.checks.map((c) => c.metric)).toEqual([
      "leads",
      "campaigns",
      "emailsPerMonth",
    ]);
    expect(JSON.stringify(usage)).not.toMatch(/credit|balance/i);
  });

  it("uses the plan catalog limits (single source of truth)", () => {
    const usage = buildWorkspaceUsage({
      workspace_id: "ws",
      plan: "agency",
      period_start: "2026-10-01",
      source: "computed",
      metrics: { leads: 0, campaigns: 0, emailsPerMonth: 0 },
    });
    const emails = usage.checks.find((c) => c.metric === "emailsPerMonth")!;
    // The famous "1,000,000" is the AGENCY email quota constant —
    // verified here as a limit, never as a spendable balance.
    expect(emails.limit).toBe(1_000_000);
    expect(usage.plan).toBe("agency");
  });
});

describe("DemoUsageRepository", () => {
  it("computes usage from the same demo stores the pages read", async () => {
    const usageRepo = createUsageRepository("demo");
    const leadsRepo = createLeadsRepository("demo");
    const campaignsRepo = createCampaignsRepository("demo");

    const usage = await usageRepo.getWorkspaceUsage(DEMO_WORKSPACE_ID);
    expect(usage.source).toBe("computed");
    expect(usage.plan).toBe(DEMO_WORKSPACE_PLAN);

    const leads = await leadsRepo.listLeads(DEMO_WORKSPACE_ID);
    const campaigns = await campaignsRepo.listCampaigns(DEMO_WORKSPACE_ID);
    const byMetric = Object.fromEntries(
      usage.checks.map((c) => [c.metric, c.used])
    );
    expect(byMetric.leads).toBe(leads.length);
    expect(byMetric.campaigns).toBe(
      campaigns.filter((c) => c.status !== "archived").length
    );
    expect(typeof byMetric.emailsPerMonth).toBe("number");
  });

  it("reflects new leads immediately (computed, not cached fiction)", async () => {
    const usageRepo = createUsageRepository("demo");
    const leadsRepo = createLeadsRepository("demo");
    const before = await usageRepo.getWorkspaceUsage(DEMO_WORKSPACE_ID);
    await leadsRepo.createLead(DEMO_WORKSPACE_ID, {
      first_name: "New",
      last_name: "Lead",
      email: "new.lead@example.com",
      tags: [],
    });
    const after = await usageRepo.getWorkspaceUsage(DEMO_WORKSPACE_ID);
    const pick = (u: typeof before) =>
      u.checks.find((c) => c.metric === "leads")!.used;
    expect(pick(after)).toBe(pick(before) + 1);
  });
});
