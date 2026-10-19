import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import { createLeadsRepository } from "@/lib/data/leads";
import {
  findDuplicateGroups,
  countDuplicatedLeads,
  normalizeEmail,
} from "@/lib/data/duplicates";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import type { Lead } from "@/types";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("DemoLeadsRepository tag operations (CRM lists)", () => {
  it("renames a tag across every lead that carries it", async () => {
    const repo = createLeadsRepository("demo");
    const tags = await repo.listTags(DEMO_WORKSPACE_ID);
    expect(tags.length).toBeGreaterThan(0);
    const original = tags[0];
    const changed = await repo.renameTag(DEMO_WORKSPACE_ID, original, "Renamed List");
    expect(changed).toBeGreaterThan(0);

    const leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(leads.some((l) => l.tags.includes(original))).toBe(false);
    expect(
      leads.filter((l) => l.tags.includes("Renamed List"))
    ).toHaveLength(changed);
    await expect(repo.listTags(DEMO_WORKSPACE_ID)).resolves.toContain(
      "Renamed List"
    );
  });

  it("deletes a tag from all leads without deleting the leads", async () => {
    const repo = createLeadsRepository("demo");
    const before = await repo.listLeads(DEMO_WORKSPACE_ID);
    const tag = (await repo.listTags(DEMO_WORKSPACE_ID))[0];
    const changed = await repo.deleteTag(DEMO_WORKSPACE_ID, tag);
    expect(changed).toBeGreaterThan(0);
    const after = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(after).toHaveLength(before.length);
    expect(after.some((l) => l.tags.includes(tag))).toBe(false);
  });

  it("applies and removes a tag on a selected subset only", async () => {
    const repo = createLeadsRepository("demo");
    const leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    const [a, b] = leads;
    const applied = await repo.applyTag(DEMO_WORKSPACE_ID, [a.id, b.id], "VIP");
    expect(applied).toBe(2);
    let now = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(now.filter((l) => l.tags.includes("VIP"))).toHaveLength(2);

    // Re-applying changes nothing (count = leads actually changed)
    // and never duplicates the tag.
    expect(await repo.applyTag(DEMO_WORKSPACE_ID, [a.id], "VIP")).toBe(0);
    now = await repo.listLeads(DEMO_WORKSPACE_ID);
    const leadA = now.find((l) => l.id === a.id)!;
    expect(leadA.tags.filter((t) => t === "VIP")).toHaveLength(1);

    const removed = await repo.removeTag(DEMO_WORKSPACE_ID, [a.id], "VIP");
    expect(removed).toBe(1);
    now = await repo.listLeads(DEMO_WORKSPACE_ID);
    expect(now.find((l) => l.id === a.id)!.tags).not.toContain("VIP");
    expect(now.find((l) => l.id === b.id)!.tags).toContain("VIP");
  });

  it("normalizes tag names (trim; empty names are rejected)", async () => {
    const repo = createLeadsRepository("demo");
    const leads = await repo.listLeads(DEMO_WORKSPACE_ID);
    await repo.applyTag(DEMO_WORKSPACE_ID, [leads[0].id], "  Padded Tag  ");
    const tags = await repo.listTags(DEMO_WORKSPACE_ID);
    expect(tags).toContain("Padded Tag");
    await expect(
      repo.applyTag(DEMO_WORKSPACE_ID, [leads[0].id], "   ")
    ).rejects.toThrow(/cannot be empty/);
  });
});

// ── Duplicate detection ─────────────────────────────────────────────────────

function lead(partial: Partial<Lead> & { id: string }): Lead {
  return {
    workspace_id: "ws",
    first_name: "A",
    last_name: "B",
    email: "a@b.io",
    company: "Co",
    job_title: "",
    linkedin_url: "",
    status: "new",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as Lead;
}

describe("findDuplicateGroups", () => {
  it("groups by normalized email (case/whitespace-insensitive)", () => {
    const groups = findDuplicateGroups([
      lead({ id: "1", email: "Dup@Example.com" }),
      lead({ id: "2", email: " dup@example.com " }),
      lead({ id: "3", email: "other@example.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("email");
    expect(groups[0].leads.map((l) => l.id).sort()).toEqual(["1", "2"]);
    expect(countDuplicatedLeads(groups)).toBe(2);
  });

  it("groups by same name + company when emails differ", () => {
    const groups = findDuplicateGroups([
      lead({ id: "1", email: "a@x.io", first_name: "Sam", last_name: "Lee", company: "Acme" }),
      lead({ id: "2", email: "b@y.io", first_name: "sam", last_name: "lee", company: "ACME" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("name_company");
  });

  it("does not double-claim a lead already in an email group", () => {
    const groups = findDuplicateGroups([
      lead({ id: "1", email: "same@x.io", first_name: "Sam", last_name: "Lee", company: "Acme" }),
      lead({ id: "2", email: "same@x.io", first_name: "Sam", last_name: "Lee", company: "Acme" }),
      lead({ id: "3", email: "other@x.io", first_name: "Sam", last_name: "Lee", company: "Acme" }),
    ]);
    // 1+2 group by email; 3 stays unclaimed and alone → no second group.
    expect(groups).toHaveLength(1);
    expect(groups[0].leads).toHaveLength(2);
  });

  it("never groups on an empty email; normalizeEmail trims/lower-cases", () => {
    expect(normalizeEmail("  A@B.IO ")).toBe("a@b.io");
    const groups = findDuplicateGroups([
      lead({ id: "1", email: "", first_name: "One", company: "Alpha" }),
      lead({ id: "2", email: "", first_name: "Two", company: "Beta" }),
      lead({ id: "3", email: "solo@x.io" }),
    ]);
    // Blank emails + distinct name/company → no groups at all.
    expect(groups).toHaveLength(0);
  });
});
