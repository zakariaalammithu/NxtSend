/**
 * Suppression store — one interface over the two backends.
 *
 *  - Supabase backend: the `suppression_list` table (migration 001).
 *    Constructed with whichever client fits the caller: the
 *    service-role client for the PUBLIC unsubscribe endpoint (no
 *    session exists there — the signed token is the credential), or
 *    the session client for the workspace UI API (RLS policy
 *    "suppression: members can manage" scopes every row to the
 *    caller's own workspaces on top of the explicit filter).
 *  - Demo backend: the browser/server demo collection
 *    (`nxtsend_demo_suppressions_v1`), so in Demo Mode the public
 *    endpoint, the management UI and the demo executor all read and
 *    write ONE demo list and the whole flow is testable end-to-end.
 *    Outside the browser the demo store falls back to process memory
 *    (see src/lib/data/demo-store.ts) — demo data only, by design.
 *
 * The table has no `source` column: provenance is carried in the
 * reason text by convention ("bounced (Resend webhook)",
 * "unsubscribed", "unsubscribed (manual)", …) and the UI derives a
 * source label from it. No migration was needed for Stage C.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDemoCollection, saveDemoCollection } from "@/lib/data/demo-store";
import { generateId } from "@/lib/utils";
import { isSuppressed, normalizeEmail } from "./suppression";

export interface SuppressionEntry {
  id: string;
  workspace_id: string;
  email: string;
  reason: string;
  created_at: string;
}

export interface SuppressionStore {
  list(workspaceId: string): Promise<SuppressionEntry[]>;
  /** Idempotent: returns the existing entry when already suppressed. */
  add(
    workspaceId: string,
    email: string,
    reason: string
  ): Promise<{ entry: SuppressionEntry; created: boolean }>;
  /** Returns true when an entry was actually removed. */
  remove(workspaceId: string, email: string): Promise<boolean>;
  check(workspaceId: string, email: string): Promise<boolean>;
}

// ── Supabase backend ────────────────────────────────────────────────────────

interface SuppressionRow {
  id: string;
  workspace_id: string;
  email: string;
  reason: string | null;
  created_at: string;
}

function rowToEntry(row: SuppressionRow): SuppressionEntry {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    email: String(row.email),
    reason: row.reason ?? "",
    created_at: String(row.created_at),
  };
}

export function createSupabaseSuppressionStore(
  client: SupabaseClient
): SuppressionStore {
  return {
    async list(workspaceId) {
      const { data, error } = await client
        .from("suppression_list")
        .select("id, workspace_id, email, reason, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to list suppressions: ${error.message}`);
      }
      return (data ?? []).map((r) => rowToEntry(r as SuppressionRow));
    },

    async add(workspaceId, email, reason) {
      const normalized = normalizeEmail(email);
      const { data: existing } = await client
        .from("suppression_list")
        .select("id, workspace_id, email, reason, created_at")
        .eq("workspace_id", workspaceId)
        .eq("email", normalized)
        .maybeSingle();
      if (existing) {
        return { entry: rowToEntry(existing as SuppressionRow), created: false };
      }
      const { data, error } = await client
        .from("suppression_list")
        .upsert(
          { workspace_id: workspaceId, email: normalized, reason },
          { onConflict: "workspace_id,email", ignoreDuplicates: true }
        )
        .select("id, workspace_id, email, reason, created_at")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to record suppression: ${error.message}`);
      }
      if (data) return { entry: rowToEntry(data as SuppressionRow), created: true };
      // Lost a concurrent-insert race with ignoreDuplicates: re-read.
      const { data: after } = await client
        .from("suppression_list")
        .select("id, workspace_id, email, reason, created_at")
        .eq("workspace_id", workspaceId)
        .eq("email", normalized)
        .maybeSingle();
      if (!after) throw new Error("Failed to record suppression.");
      return { entry: rowToEntry(after as SuppressionRow), created: false };
    },

    async remove(workspaceId, email) {
      const normalized = normalizeEmail(email);
      const { data, error } = await client
        .from("suppression_list")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("email", normalized)
        .select("id");
      if (error) {
        throw new Error(`Failed to remove suppression: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },

    async check(workspaceId, email) {
      const { data, error } = await client
        .from("suppression_list")
        .select("email")
        .eq("workspace_id", workspaceId);
      if (error) {
        throw new Error(`Suppression check failed: ${error.message}`);
      }
      return isSuppressed(
        (data ?? []).map((r) => String((r as { email: string }).email)),
        email
      );
    },
  };
}

// ── Demo backend ────────────────────────────────────────────────────────────

export const DEMO_SUPPRESSIONS_KEY = "nxtsend_demo_suppressions_v1";

export function createDemoSuppressionStore(): SuppressionStore {
  const load = (): SuppressionEntry[] =>
    loadDemoCollection<SuppressionEntry>(DEMO_SUPPRESSIONS_KEY, () => []);
  const save = (entries: SuppressionEntry[]): void =>
    saveDemoCollection(DEMO_SUPPRESSIONS_KEY, entries);

  return {
    async list(workspaceId) {
      return load()
        .filter((e) => e.workspace_id === workspaceId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async add(workspaceId, email, reason) {
      const normalized = normalizeEmail(email);
      const all = load();
      const existing = all.find(
        (e) => e.workspace_id === workspaceId && e.email === normalized
      );
      if (existing) return { entry: existing, created: false };
      const entry: SuppressionEntry = {
        id: `sup_demo_${generateId()}`,
        workspace_id: workspaceId,
        email: normalized,
        reason,
        created_at: new Date().toISOString(),
      };
      all.unshift(entry);
      save(all);
      return { entry, created: true };
    },

    async remove(workspaceId, email) {
      const normalized = normalizeEmail(email);
      const all = load();
      const next = all.filter(
        (e) => !(e.workspace_id === workspaceId && e.email === normalized)
      );
      if (next.length === all.length) return false;
      save(next);
      return true;
    },

    async check(workspaceId, email) {
      return isSuppressed(
        load()
          .filter((e) => e.workspace_id === workspaceId)
          .map((e) => e.email),
        email
      );
    },
  };
}

/**
 * Reasons a user may pick for a manual add (the suppression API's
 * closed vocabulary — free text is not accepted, because the
 * executor's stop-rule labels key off these words: "unsub",
 * "bounce", "complain").
 */
export const MANUAL_SUPPRESSION_REASONS = [
  "unsubscribed (manual)",
  "bounced (manual)",
  "spam complaint (manual)",
  "manual block",
] as const;

/** Derives the display "source" from the reason-text convention. */
export function suppressionSourceLabel(reason: string): string {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("webhook")) return "Provider webhook";
  if (r.includes("manual")) return "Added manually";
  if (r.includes("unsub")) return "Unsubscribe link";
  return "System";
}
