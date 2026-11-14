/**
 * Prompt-snippet repository — the co-pilot snippet library: short
 * reusable reply texts an owner writes once (title / body / category)
 * and inserts into the Inbox composer. Managed from the AI
 * Personalization page; no separate settings page.
 *
 * One interface, two backends (same pattern as src/lib/data/leads.ts):
 * - Supabase backend (mode "supabase"): the `prompt_snippets` table
 *   (migration 022) through the browser client, workspace-scoped, with
 *   RLS (`is_workspace_member`) enforcing tenant isolation again.
 * - Demo backend (mode "demo"): persisted through the localStorage
 *   demo store, clearly demo data. Starts empty — no starter rows are
 *   seeded (migration 022 seeds nothing either).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { generateId } from "@/lib/utils";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";

export const DEMO_PROMPT_SNIPPETS_KEY = "nxtsend_demo_prompt_snippets_v1";

export const SNIPPET_CATEGORIES = [
  "general",
  "greeting",
  "follow-up",
  "closing",
  "other",
] as const;

export interface PromptSnippet {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
}

export interface CreateSnippetInput {
  title: string;
  body: string;
  category?: string;
}

export interface PromptSnippetsRepository {
  readonly mode: DataMode;
  listSnippets(workspaceId: string): Promise<PromptSnippet[]>;
  createSnippet(
    workspaceId: string,
    input: CreateSnippetInput
  ): Promise<PromptSnippet>;
  updateSnippet(
    id: string,
    patch: Partial<Pick<PromptSnippet, "title" | "body" | "category">>
  ): Promise<PromptSnippet>;
  deleteSnippet(id: string): Promise<void>;
}

function normalizeSnippetInput(input: CreateSnippetInput): {
  title: string;
  body: string;
  category: string;
} {
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 4000);
  if (!title || !body) {
    throw new Error("A snippet needs both a title and a body.");
  }
  const category = (input.category ?? "general").trim().slice(0, 60) || "general";
  return { title, body, category };
}

// ============================================================================
// Demo backend
// ============================================================================

class DemoPromptSnippetsRepository implements PromptSnippetsRepository {
  readonly mode: DataMode = "demo";

  private load(): PromptSnippet[] {
    return loadDemoCollection<PromptSnippet>(DEMO_PROMPT_SNIPPETS_KEY, () => []);
  }

  private save(items: PromptSnippet[]): void {
    saveDemoCollection(DEMO_PROMPT_SNIPPETS_KEY, items);
  }

  async listSnippets(workspaceId: string): Promise<PromptSnippet[]> {
    return this.load()
      .filter((s) => s.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createSnippet(
    workspaceId: string,
    input: CreateSnippetInput
  ): Promise<PromptSnippet> {
    const { title, body, category } = normalizeSnippetInput(input);
    const snippet: PromptSnippet = {
      id: `snippet_demo_${generateId()}`,
      workspace_id: workspaceId,
      title,
      body,
      category,
      created_at: new Date().toISOString(),
    };
    const items = this.load();
    items.unshift(snippet);
    this.save(items);
    return snippet;
  }

  async updateSnippet(
    id: string,
    patch: Partial<Pick<PromptSnippet, "title" | "body" | "category">>
  ): Promise<PromptSnippet> {
    const items = this.load();
    const idx = items.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error(`Snippet not found: ${id}`);
    const next = { ...items[idx] };
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, 120);
      if (!title) throw new Error("A snippet title cannot be empty.");
      next.title = title;
    }
    if (patch.body !== undefined) {
      const body = patch.body.trim().slice(0, 4000);
      if (!body) throw new Error("A snippet body cannot be empty.");
      next.body = body;
    }
    if (patch.category !== undefined) {
      next.category = patch.category.trim().slice(0, 60) || "general";
    }
    items[idx] = next;
    this.save(items);
    return next;
  }

  async deleteSnippet(id: string): Promise<void> {
    this.save(this.load().filter((s) => s.id !== id));
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type SnippetRow = Record<string, unknown>;

function rowToSnippet(row: SnippetRow): PromptSnippet {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    category: String(row.category ?? "general"),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

class SupabasePromptSnippetsRepository implements PromptSnippetsRepository {
  readonly mode: DataMode = "supabase";
  private readonly clientFactory: () => SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.clientFactory = client ? () => client : () => createClient();
  }

  private client(): SupabaseClient {
    const c = this.clientFactory();
    if (!c) throw new Error("Supabase client is not configured");
    return c;
  }

  async listSnippets(workspaceId: string): Promise<PromptSnippet[]> {
    const { data, error } = await this.client()
      .from("prompt_snippets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load snippets: ${error.message}`);
    return (data ?? []).map((r) => rowToSnippet(r as SnippetRow));
  }

  async createSnippet(
    workspaceId: string,
    input: CreateSnippetInput
  ): Promise<PromptSnippet> {
    const { title, body, category } = normalizeSnippetInput(input);
    const { data, error } = await this.client()
      .from("prompt_snippets")
      .insert({ workspace_id: workspaceId, title, body, category })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create snippet: ${error.message}`);
    return rowToSnippet(data as SnippetRow);
  }

  async updateSnippet(
    id: string,
    patch: Partial<Pick<PromptSnippet, "title" | "body" | "category">>
  ): Promise<PromptSnippet> {
    const safePatch: SnippetRow = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, 120);
      if (!title) throw new Error("A snippet title cannot be empty.");
      safePatch.title = title;
    }
    if (patch.body !== undefined) {
      const body = patch.body.trim().slice(0, 4000);
      if (!body) throw new Error("A snippet body cannot be empty.");
      safePatch.body = body;
    }
    if (patch.category !== undefined) {
      safePatch.category = patch.category.trim().slice(0, 60) || "general";
    }
    const { data, error } = await this.client()
      .from("prompt_snippets")
      .update(safePatch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update snippet: ${error.message}`);
    return rowToSnippet(data as SnippetRow);
  }

  async deleteSnippet(id: string): Promise<void> {
    const { error } = await this.client()
      .from("prompt_snippets")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`Failed to delete snippet: ${error.message}`);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPromptSnippetsRepository(
  mode: DataMode = getDataMode(),
  client?: SupabaseClient | null
): PromptSnippetsRepository {
  return mode === "supabase"
    ? new SupabasePromptSnippetsRepository(client)
    : new DemoPromptSnippetsRepository();
}
