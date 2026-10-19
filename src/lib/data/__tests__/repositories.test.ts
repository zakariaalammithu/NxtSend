import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createLeadsRepository } from "@/lib/data/leads";
import { createCampaignsRepository } from "@/lib/data/campaigns";
import { createAdminRepository } from "@/lib/data/admin";
import { createIntegrationsRepository } from "@/lib/data/integrations";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";

beforeEach(() => {
  // Every test gets a fresh, empty demo store (seeded on first read).
  setDemoStorage(createMemoryStorage());
});

describe("DemoLeadsRepository", () => {
  it("seeds from the mock dataset, scoped to the demo workspace", async () => {
    const repo = createLeadsRepository("demo");
    expect(repo.mode).toBe("demo");
    const leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(leads.length).toBe(10);
    expect(leads[0].email).toBe("sarah.jenkins@stripe.com");
    expect(await repo.listLeads("ws_someone_else")).toEqual([]);
  });

  it("creates, updates and deletes leads persistently", async () => {
    const repo = createLeadsRepository("demo");
    const created = await repo.createLead(DEMO_WORKSPACE_ID, {
      first_name: "Test",
      last_name: "Person",
      email: "test.person@example.com",
      company: "Example Co",
      tags: ["QA"],
    });
    expect(created.status).toBe("new");

    let leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(leads.some((l) => l.id === created.id)).toBe(true);

    const updated = await repo.updateLead(created.id, { status: "contacted" });
    expect(updated.status).toBe("contacted");

    await repo.deleteLead(created.id);
    leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(leads.some((l) => l.id === created.id)).toBe(false);
  });

  it("imports a batch and reports tags across the workspace", async () => {
    const repo = createLeadsRepository("demo");
    const imported = await repo.importLeads(DEMO_WORKSPACE_ID, [
      { first_name: "A", email: "a@x.io", tags: ["Imported", "QA"] },
      { first_name: "B", email: "b@x.io", tags: ["Imported"] },
    ]);
    expect(imported).toHaveLength(2);
    const tags = await repo.listTags(DEMO_WORKSPACE_ID);
    expect(tags).toContain("Imported");
    expect(tags).toContain("QA");
    expect(tags).toContain("Fintech"); // from the seed data
  });

  it("bulk-deletes by id list", async () => {
    const repo = createLeadsRepository("demo");
    const leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    await repo.deleteLeads(leads.slice(0, 3).map((l) => l.id));
    expect(await repo.listLeads(DEMO_WORKSPACE_ID)).toHaveLength(7);
  });
});

describe("DemoCampaignsRepository", () => {
  it("seeds the mock campaigns and the example sequence for cmp_demo_001", async () => {
    const repo = createCampaignsRepository("demo");
    const campaigns = await repo.listCampaigns(DEMO_WORKSPACE_ID);
    expect(campaigns).toHaveLength(5);
    const steps = await repo.getCampaignSteps("cmp_demo_001");
    expect(steps).toHaveLength(4);
    expect(steps[0].step_type).toBe("connection_request");
    expect(await repo.getCampaignSteps("cmp_demo_002")).toEqual([]);
  });

  it("creates a campaign with steps and logs a simulated activity entry", async () => {
    const repo = createCampaignsRepository("demo");
    const campaign = await repo.createCampaign(DEMO_WORKSPACE_ID, {
      name: "Test Campaign",
      type: "linkedin",
      status: "active",
      steps: [
        { step_type: "connection_request", delay_hours: 0, content: "Hi {{first_name}}" },
        { step_type: "wait", delay_hours: 24 },
      ],
    });
    expect(campaign.status).toBe("active");
    const steps = await repo.getCampaignSteps(campaign.id);
    expect(steps.map((s) => s.step_order)).toEqual([1, 2]);

    const activity = await repo.listActivity(DEMO_WORKSPACE_ID, campaign.id);
    expect(activity).toHaveLength(1);
    expect(activity[0].action).toBe("campaign_created");
    expect(activity[0].simulated).toBe(true);
  });

  it("persists lifecycle transitions and logs each one", async () => {
    const repo = createCampaignsRepository("demo");
    await repo.setCampaignStatus(DEMO_WORKSPACE_ID, "cmp_demo_002", "paused");
    let campaign = await repo.getCampaign(DEMO_WORKSPACE_ID, "cmp_demo_002");
    expect(campaign?.status).toBe("paused");

    await repo.setCampaignStatus(DEMO_WORKSPACE_ID, "cmp_demo_002", "active");
    campaign = await repo.getCampaign(DEMO_WORKSPACE_ID, "cmp_demo_002");
    expect(campaign?.status).toBe("active");

    const actions = (
      await repo.listActivity(DEMO_WORKSPACE_ID, "cmp_demo_002")
    ).map((a) => a.action);
    expect(actions).toContain("campaign_paused");
    expect(actions).toContain("campaign_resumed");
  });

  it("duplicates a campaign as a draft with copied steps", async () => {
    const repo = createCampaignsRepository("demo");
    const copy = await repo.duplicateCampaign(DEMO_WORKSPACE_ID, "cmp_demo_001");
    expect(copy.name).toBe("SaaS Founders Q4 Outreach (Copy)");
    expect(copy.status).toBe("draft");
    expect(copy.id).not.toBe("cmp_demo_001");
    expect(await repo.getCampaignSteps(copy.id)).toHaveLength(4);
    expect(await repo.listCampaigns(DEMO_WORKSPACE_ID)).toHaveLength(6);
  });

  it("archives and deletes campaigns", async () => {
    const repo = createCampaignsRepository("demo");
    await repo.setCampaignStatus(DEMO_WORKSPACE_ID, "cmp_demo_005", "archived");
    expect(
      (await repo.getCampaign(DEMO_WORKSPACE_ID, "cmp_demo_005"))?.status
    ).toBe("archived");

    await repo.deleteCampaign(DEMO_WORKSPACE_ID, "cmp_demo_005");
    expect(await repo.getCampaign(DEMO_WORKSPACE_ID, "cmp_demo_005")).toBeNull();
    expect(await repo.getCampaignSteps("cmp_demo_005")).toEqual([]);
    const actions = (await repo.listActivity(DEMO_WORKSPACE_ID)).map((a) => a.action);
    expect(actions).toContain("campaign_deleted");
  });

  it("replaces steps in order", async () => {
    const repo = createCampaignsRepository("demo");
    const steps = await repo.replaceCampaignSteps("cmp_demo_003", [
      { step_type: "email", delay_hours: 0, subject: "Intro", content: "Hello" },
      { step_type: "email", delay_hours: 72, subject: "Bump", content: "Bump" },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[1].delay_hours).toBe(72);
    const reloaded = await repo.getCampaignSteps("cmp_demo_003");
    expect(reloaded.map((s) => s.subject)).toEqual(["Intro", "Bump"]);
  });

  it("throws on lifecycle actions for a missing campaign", async () => {
    const repo = createCampaignsRepository("demo");
    await expect(
      repo.setCampaignStatus(DEMO_WORKSPACE_ID, "cmp_missing", "paused")
    ).rejects.toThrow("Campaign not found");
  });

  it("enrolls leads once and skips re-enrollment", async () => {
    const repo = createCampaignsRepository("demo");
    const first = await repo.enrollLeads(DEMO_WORKSPACE_ID, "cmp_demo_001", [
      "lead_demo_001",
      "lead_demo_002",
    ]);
    expect(first).toEqual({ enrolled: 2, skipped: 0 });

    const second = await repo.enrollLeads(DEMO_WORKSPACE_ID, "cmp_demo_001", [
      "lead_demo_002",
      "lead_demo_003",
    ]);
    expect(second).toEqual({ enrolled: 1, skipped: 1 });

    const enrollments = await repo.listEnrollments("cmp_demo_001");
    expect(enrollments).toHaveLength(3);
    expect(enrollments.every((e) => e.status === "pending")).toBe(true);
  });
});

describe("DemoAdminRepository", () => {
  it("lists the seeded admin users and computes an overview from them", async () => {
    const repo = createAdminRepository("demo");
    const users = await repo.listUsers();
    expect(users).toHaveLength(8);

    const overview = await repo.getOverview();
    expect(overview.totalUsers).toBe(8);
    expect(overview.suspendedUsers).toBe(1);
    expect(overview.activeUsers).toBe(7);
    expect(overview.totalWorkspaces).toBe(15);
    expect(overview.recentUsers).toHaveLength(5);
    // Most recently joined first (Priya Patel, 2024-04-18).
    expect(overview.recentUsers[0].email).toBe("priya@finpulse.tech");
  });

  it("suspends and reactivates a user persistently", async () => {
    const repo = createAdminRepository("demo");
    const suspended = await repo.setUserStatus("usr_003", "suspended");
    expect(suspended.status).toBe("suspended");
    const users = await repo.listUsers();
    expect(users.find((u) => u.id === "usr_003")?.status).toBe("suspended");
    expect((await repo.getOverview()).suspendedUsers).toBe(2);

    const reactivated = await repo.setUserStatus("usr_003", "active");
    expect(reactivated.status).toBe("active");
  });

  it("throws when suspending an unknown user", async () => {
    const repo = createAdminRepository("demo");
    await expect(repo.setUserStatus("usr_missing", "suspended")).rejects.toThrow(
      "User not found"
    );
  });
});

describe("DemoIntegrationsRepository", () => {
  it("returns the mock integrations for the demo workspace without leaking store references", async () => {
    const repo = createIntegrationsRepository("demo");
    const integrations = await repo.listIntegrations(DEMO_WORKSPACE_ID);
    expect(integrations.map((i) => i.provider)).toContain("LinkedIn");
    expect(integrations.every((i) => i.status === "demo" || i.status === "disconnected")).toBe(true);
  });
});
