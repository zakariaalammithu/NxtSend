/**
 * Leads repository — one interface, two backends.
 *
 * - Supabase backend (mode "supabase"): queries the `leads` table through
 *   the browser client. Every query is scoped by workspace_id and the
 *   database enforces tenant isolation again via RLS, including the
 *   per-workspace unique email index used for duplicate protection.
 * - Demo backend (mode "demo"): the bundled MOCK_LEADS dataset, persisted
 *   through the localStorage demo store so adds/imports/deletes behave
 *   like a real product inside the browser. Clearly demo data.
 */

import type { Lead } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { MOCK_LEADS } from "@/lib/db/mock/data";
import { generateId } from "@/lib/utils";
import { getDataMode, type DataMode } from "./mode";
import { withLeadWebhookEvents } from "./webhook-emission";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";
import type { NewLeadInput } from "./csv";

const DEMO_LEADS_KEY = "nxtsend_demo_leads_v1";

export interface CreateLeadInput extends NewLeadInput {
  status?: Lead["status"];
}

export interface LeadsRepository {
  readonly mode: DataMode;
  listLeads(workspaceId: string): Promise<Lead[]>;
  createLead(workspaceId: string, input: CreateLeadInput): Promise<Lead>;
  updateLead(id: string, patch: Partial<Lead>): Promise<Lead>;
  deleteLead(id: string): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;
  importLeads(workspaceId: string, inputs: NewLeadInput[]): Promise<Lead[]>;
  /** Distinct tags across the workspace's leads (tags are the list model). */
  listTags(workspaceId: string): Promise<string[]>;
  /**
   * Tag/list management (tags ARE the list model in this app — the
   * admin CRM view reads the same tags). Each returns how many leads
   * were actually changed.
   */
  renameTag(workspaceId: string, from: string, to: string): Promise<number>;
  deleteTag(workspaceId: string, tag: string): Promise<number>;
  applyTag(workspaceId: string, leadIds: string[], tag: string): Promise<number>;
  removeTag(workspaceId: string, leadIds: string[], tag: string): Promise<number>;
}

/** Trims a tag and rejects empty results — tags are compared exactly after trimming. */
export function normalizeTag(tag: string): string {
  return tag.trim();
}

function cloneMockLeads(): Lead[] {
  return MOCK_LEADS.map((l) => ({
    ...l,
    tags: [...l.tags],
    custom_fields: { ...l.custom_fields },
  }));
}

// ============================================================================
// Demo backend
// ============================================================================

class DemoLeadsRepository implements LeadsRepository {
  readonly mode: DataMode = "demo";

  private load(): Lead[] {
    return loadDemoCollection<Lead>(DEMO_LEADS_KEY, cloneMockLeads);
  }

  private save(leads: Lead[]): void {
    saveDemoCollection(DEMO_LEADS_KEY, leads);
  }

  async listLeads(workspaceId: string): Promise<Lead[]> {
    return this.load().filter((l) => l.workspace_id === workspaceId);
  }

  async createLead(workspaceId: string, input: CreateLeadInput): Promise<Lead> {
    const lead: Lead = {
      id: `lead_demo_${generateId()}`,
      workspace_id: workspaceId,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      company: input.company,
      job_title: input.job_title,
      linkedin_url: input.linkedin_url,
      status: input.status ?? "new",
      tags: [...input.tags],
      custom_fields: {},
      created_at: new Date().toISOString(),
    };
    const leads = this.load();
    leads.unshift(lead);
    this.save(leads);
    return lead;
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const leads = this.load();
    const idx = leads.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error(`Lead not found: ${id}`);
    const updated = { ...leads[idx], ...patch, id: leads[idx].id };
    leads[idx] = updated;
    this.save(leads);
    return updated;
  }

  async deleteLead(id: string): Promise<void> {
    this.save(this.load().filter((l) => l.id !== id));
  }

  async deleteLeads(ids: string[]): Promise<void> {
    const drop = new Set(ids);
    this.save(this.load().filter((l) => !drop.has(l.id)));
  }

  async importLeads(workspaceId: string, inputs: NewLeadInput[]): Promise<Lead[]> {
    const created: Lead[] = [];
    const leads = this.load();
    for (const input of inputs) {
      const lead: Lead = {
        id: `lead_demo_${generateId()}`,
        workspace_id: workspaceId,
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        company: input.company,
        job_title: input.job_title,
        linkedin_url: input.linkedin_url,
        status: "new",
        tags: [...input.tags],
        custom_fields: {},
        created_at: new Date().toISOString(),
      };
      leads.unshift(lead);
      created.push(lead);
    }
    this.save(leads);
    return created;
  }

  async listTags(workspaceId: string): Promise<string[]> {
    const tags = new Set<string>();
    for (const lead of await this.listLeads(workspaceId)) {
      for (const t of lead.tags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  }

  async renameTag(workspaceId: string, from: string, to: string): Promise<number> {
    const target = normalizeTag(to);
    if (!target) throw new Error("Tag name cannot be empty.");
    const leads = this.load();
    let changed = 0;
    const next = leads.map((lead) => {
      if (lead.workspace_id !== workspaceId || !lead.tags.includes(from)) return lead;
      const tags = Array.from(new Set(lead.tags.map((t) => (t === from ? target : t))));
      changed++;
      return { ...lead, tags };
    });
    if (changed > 0) this.save(next);
    return changed;
  }

  async deleteTag(workspaceId: string, tag: string): Promise<number> {
    const leads = this.load();
    let changed = 0;
    const next = leads.map((lead) => {
      if (lead.workspace_id !== workspaceId || !lead.tags.includes(tag)) return lead;
      changed++;
      return { ...lead, tags: lead.tags.filter((t) => t !== tag) };
    });
    if (changed > 0) this.save(next);
    return changed;
  }

  async applyTag(workspaceId: string, leadIds: string[], tag: string): Promise<number> {
    const target = normalizeTag(tag);
    if (!target) throw new Error("Tag name cannot be empty.");
    const wanted = new Set(leadIds);
    const leads = this.load();
    let changed = 0;
    const next = leads.map((lead) => {
      if (lead.workspace_id !== workspaceId || !wanted.has(lead.id) || lead.tags.includes(target)) {
        return lead;
      }
      changed++;
      return { ...lead, tags: [...lead.tags, target] };
    });
    if (changed > 0) this.save(next);
    return changed;
  }

  async removeTag(workspaceId: string, leadIds: string[], tag: string): Promise<number> {
    const wanted = new Set(leadIds);
    const leads = this.load();
    let changed = 0;
    const next = leads.map((lead) => {
      if (lead.workspace_id !== workspaceId || !wanted.has(lead.id) || !lead.tags.includes(tag)) {
        return lead;
      }
      changed++;
      return { ...lead, tags: lead.tags.filter((t) => t !== tag) };
    });
    if (changed > 0) this.save(next);
    return changed;
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type LeadRow = Record<string, unknown>;

function rowToLead(row: LeadRow): Lead {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    first_name: (row.first_name as string) ?? undefined,
    last_name: (row.last_name as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    linkedin_url: (row.linkedin_url as string) ?? undefined,
    company: (row.company as string) ?? undefined,
    job_title: (row.job_title as string) ?? undefined,
    status: (row.status as string) ?? "new",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    custom_fields:
      row.custom_fields && typeof row.custom_fields === "object"
        ? (row.custom_fields as Record<string, unknown>)
        : {},
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function inputToRow(workspaceId: string, input: NewLeadInput): LeadRow {
  return {
    workspace_id: workspaceId,
    first_name: input.first_name,
    last_name: input.last_name ?? null,
    email: input.email,
    company: input.company ?? null,
    job_title: input.job_title ?? null,
    linkedin_url: input.linkedin_url ?? null,
    status: "new",
    tags: input.tags,
    custom_fields: {},
  };
}

class SupabaseLeadsRepository implements LeadsRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    return supabase;
  }

  async listLeads(workspaceId: string): Promise<Lead[]> {
    const { data, error } = await this.client()
      .from("leads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load leads: ${error.message}`);
    return (data ?? []).map((r) => rowToLead(r as LeadRow));
  }

  async createLead(workspaceId: string, input: CreateLeadInput): Promise<Lead> {
    const row = inputToRow(workspaceId, input);
    if (input.status) row.status = input.status;
    const { data, error } = await this.client()
      .from("leads")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create lead: ${error.message}`);
    return rowToLead(data as LeadRow);
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const safePatch: LeadRow = { ...patch };
    delete safePatch.id;
    delete safePatch.workspace_id;
    delete safePatch.created_at;
    const { data, error } = await this.client()
      .from("leads")
      .update(safePatch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update lead: ${error.message}`);
    return rowToLead(data as LeadRow);
  }

  async deleteLead(id: string): Promise<void> {
    const { error } = await this.client().from("leads").delete().eq("id", id);
    if (error) throw new Error(`Failed to delete lead: ${error.message}`);
  }

  async deleteLeads(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client().from("leads").delete().in("id", ids);
    if (error) throw new Error(`Failed to delete leads: ${error.message}`);
  }

  async importLeads(workspaceId: string, inputs: NewLeadInput[]): Promise<Lead[]> {
    if (inputs.length === 0) return [];
    const rows = inputs.map((i) => inputToRow(workspaceId, i));
    const { data, error } = await this.client()
      .from("leads")
      .insert(rows)
      .select("*");
    if (error) {
      // The (workspace_id, email) unique index is the last line of defence
      // if the caller's dedupe missed a race; surface it honestly.
      throw new Error(`Failed to import leads: ${error.message}`);
    }
    return (data ?? []).map((r) => rowToLead(r as LeadRow));
  }

  async listTags(workspaceId: string): Promise<string[]> {
    const leads = await this.listLeads(workspaceId);
    const tags = new Set<string>();
    for (const lead of leads) {
      for (const t of lead.tags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  }

  async renameTag(workspaceId: string, from: string, to: string): Promise<number> {
    const target = normalizeTag(to);
    if (!target) throw new Error("Tag name cannot be empty.");
    const leads = (await this.listLeads(workspaceId)).filter((l) => l.tags.includes(from));
    let changed = 0;
    for (const lead of leads) {
      const tags = Array.from(new Set(lead.tags.map((t) => (t === from ? target : t))));
      await this.updateLead(lead.id, { tags });
      changed++;
    }
    return changed;
  }

  async deleteTag(workspaceId: string, tag: string): Promise<number> {
    const leads = (await this.listLeads(workspaceId)).filter((l) => l.tags.includes(tag));
    let changed = 0;
    for (const lead of leads) {
      await this.updateLead(lead.id, { tags: lead.tags.filter((t) => t !== tag) });
      changed++;
    }
    return changed;
  }

  async applyTag(workspaceId: string, leadIds: string[], tag: string): Promise<number> {
    const target = normalizeTag(tag);
    if (!target) throw new Error("Tag name cannot be empty.");
    const wanted = new Set(leadIds);
    const leads = (await this.listLeads(workspaceId)).filter(
      (l) => wanted.has(l.id) && !l.tags.includes(target)
    );
    let changed = 0;
    for (const lead of leads) {
      await this.updateLead(lead.id, { tags: [...lead.tags, target] });
      changed++;
    }
    return changed;
  }

  async removeTag(workspaceId: string, leadIds: string[], tag: string): Promise<number> {
    const wanted = new Set(leadIds);
    const leads = (await this.listLeads(workspaceId)).filter(
      (l) => wanted.has(l.id) && l.tags.includes(tag)
    );
    let changed = 0;
    for (const lead of leads) {
      await this.updateLead(lead.id, { tags: lead.tags.filter((t) => t !== tag) });
      changed++;
    }
    return changed;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createLeadsRepository(mode: DataMode = getDataMode()): LeadsRepository {
  const repo =
    mode === "supabase"
      ? new SupabaseLeadsRepository()
      : new DemoLeadsRepository();
  return withLeadWebhookEvents(repo);
}
