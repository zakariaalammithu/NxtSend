/**
 * Integrations-status repository.
 *
 * Demo backend: the bundled MOCK_INTEGRATIONS rows.
 * Supabase backend: reads the redacted `integrations_status` view created
 * by migration 002 — provider + status only. The raw `integrations.config`
 * JSONB (where provider secrets would live) is never exposed to regular
 * workspace members; it is restricted to workspace owners/admins at the
 * database level, and this repository does not surface it at all.
 */

import type { Integration, IntegrationStatus } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { MOCK_INTEGRATIONS } from "@/lib/db/mock/data";
import { getDataMode, type DataMode } from "./mode";

export interface IntegrationsRepository {
  readonly mode: DataMode;
  listIntegrations(workspaceId: string): Promise<Integration[]>;
}

class DemoIntegrationsRepository implements IntegrationsRepository {
  readonly mode: DataMode = "demo";

  async listIntegrations(workspaceId: string): Promise<Integration[]> {
    return MOCK_INTEGRATIONS.filter((i) => i.workspace_id === workspaceId).map(
      (i) => ({ ...i, config: { ...i.config } })
    );
  }
}

class SupabaseIntegrationsRepository implements IntegrationsRepository {
  readonly mode: DataMode = "supabase";

  async listIntegrations(workspaceId: string): Promise<Integration[]> {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    const { data, error } = await supabase
      .from("integrations_status")
      .select("id, workspace_id, provider, status, updated_at")
      .eq("workspace_id", workspaceId)
      .order("provider", { ascending: true });
    if (error) {
      throw new Error(`Failed to load integrations: ${error.message}`);
    }
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        workspace_id: String(r.workspace_id),
        provider: String(r.provider),
        status: (r.status as IntegrationStatus) ?? "disconnected",
        // Redacted by design: config is not part of the status view.
        config: {},
        updated_at: String(r.updated_at ?? new Date().toISOString()),
      } satisfies Integration;
    });
  }
}

export function createIntegrationsRepository(
  mode: DataMode = getDataMode()
): IntegrationsRepository {
  return mode === "supabase"
    ? new SupabaseIntegrationsRepository()
    : new DemoIntegrationsRepository();
}
