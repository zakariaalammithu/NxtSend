import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createPromptSnippetsRepository,
  DEMO_PROMPT_SNIPPETS_KEY,
} from "@/lib/data/prompt-snippets";
import { getDemoStorage } from "@/lib/data/demo-store";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";

beforeEach(() => {
  setDemoStorage(createMemoryStorage());
});

describe("DemoPromptSnippetsRepository", () => {
  it("starts empty — no starter rows are seeded", async () => {
    const repo = createPromptSnippetsRepository("demo");
    expect(await repo.listSnippets(DEMO_WORKSPACE_ID)).toEqual([]);
  });

  it("creates and lists snippets newest first, scoped to the workspace", async () => {
    const repo = createPromptSnippetsRepository("demo");
    const first = await repo.createSnippet(DEMO_WORKSPACE_ID, {
      title: "Thanks for reaching out",
      body: "Thanks for getting in touch — I'll follow up shortly.",
      category: "greeting",
    });
    const second = await repo.createSnippet(DEMO_WORKSPACE_ID, {
      title: "Pricing follow-up",
      body: "Just checking in on pricing.",
    });
    await repo.createSnippet("ws_someone_else", {
      title: "Not mine",
      body: "Should not appear.",
    });
    const listed = await repo.listSnippets(DEMO_WORKSPACE_ID);
    expect(listed).toHaveLength(2);
    expect(listed[0].id).toBe(second.id);
    expect(listed[1].id).toBe(first.id);
    expect(first.category).toBe("greeting");
    expect(second.category).toBe("general");
    expect(first.workspace_id).toBe(DEMO_WORKSPACE_ID);
  });

  it("rejects a snippet without a title or body", async () => {
    const repo = createPromptSnippetsRepository("demo");
    await expect(
      repo.createSnippet(DEMO_WORKSPACE_ID, { title: "  ", body: "x" })
    ).rejects.toThrow(/title and a body/);
    await expect(
      repo.createSnippet(DEMO_WORKSPACE_ID, { title: "x", body: "  " })
    ).rejects.toThrow(/title and a body/);
    expect(await repo.listSnippets(DEMO_WORKSPACE_ID)).toEqual([]);
  });

  it("updates title/body/category and rejects empty values", async () => {
    const repo = createPromptSnippetsRepository("demo");
    const created = await repo.createSnippet(DEMO_WORKSPACE_ID, {
      title: "Old",
      body: "Old body",
    });
    const updated = await repo.updateSnippet(created.id, {
      title: "New",
      body: "New body",
      category: "closing",
    });
    expect(updated.title).toBe("New");
    expect(updated.body).toBe("New body");
    expect(updated.category).toBe("closing");
    await expect(repo.updateSnippet(created.id, { title: " " })).rejects.toThrow(
      /cannot be empty/
    );
    await expect(
      repo.updateSnippet("snippet_demo_missing", { title: "x" })
    ).rejects.toThrow(/not found/);
  });

  it("deletes a snippet and persists through the demo store", async () => {
    const repo = createPromptSnippetsRepository("demo");
    const created = await repo.createSnippet(DEMO_WORKSPACE_ID, {
      title: "Temp",
      body: "Delete me.",
    });
    expect(
      JSON.parse(getDemoStorage().getItem(DEMO_PROMPT_SNIPPETS_KEY) ?? "[]")
    ).toHaveLength(1);
    await repo.deleteSnippet(created.id);
    expect(await repo.listSnippets(DEMO_WORKSPACE_ID)).toEqual([]);
    // Deleting a missing id is a no-op, not an error.
    await repo.deleteSnippet(created.id);
  });
});
