/**
 * Last-verification persistence for the Integration Center.
 *
 * Live mode: the `integrations` row per (workspace_id, provider),
 * columns added by migration 006. Reads/writes go through the
 * service-role (admin) client from server route handlers only — the
 * recorded message never contains secret material (the verify service
 * only ever returns provider-facing summaries).
 *
 * Demo mode: an in-memory map per server process. Demo verification
 * results are honest session-level data (no provider is ever called in
 * demo mode); nothing here pretends they persist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerificationRecord } from "./types";

/** Registry ids whose verification is recorded against the integrations row. */
export const VERIFICATION_PROVIDER_BY_ID: Record<string, string> = {
  supabase: "supabase",
  resend: "resend",
  warmup: "instantly_warmup",
  stripe: "stripe",
  openai: "openai",
  anthropic: "anthropic",
  "meta-model": "meta_model_api",
  webhooks: "webhooks",
};

export function providerForIntegration(id: string): string | null {
  return VERIFICATION_PROVIDER_BY_ID[id] ?? null;
}

export async function readVerificationRecords(
  admin: SupabaseClient,
  workspaceId: string
): Promise<Record<string, VerificationRecord>> {
  const { data, error } = await admin
    .from("integrations")
    .select(
      "provider, last_verified_at, last_verification_status, last_verification_message"
    )
    .eq("workspace_id", workspaceId);
  if (error || !data) return {};

  const byProvider = new Map<string, VerificationRecord>();
  for (const row of data as Array<Record<string, unknown>>) {
    if (!row.last_verified_at || !row.last_verification_status) continue;
    byProvider.set(String(row.provider), {
      ok: row.last_verification_status === "verified",
      checkedAt: String(row.last_verified_at),
      message: String(row.last_verification_message ?? ""),
    });
  }

  const out: Record<string, VerificationRecord> = {};
  for (const [id, provider] of Object.entries(VERIFICATION_PROVIDER_BY_ID)) {
    const rec = byProvider.get(provider);
    if (rec) out[id] = rec;
  }
  return out;
}

export async function recordVerification(
  admin: SupabaseClient,
  workspaceId: string,
  integrationId: string,
  record: VerificationRecord
): Promise<void> {
  const provider = providerForIntegration(integrationId);
  if (!provider) return;
  await admin.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider,
      last_verified_at: record.checkedAt,
      last_verification_status: record.ok ? "verified" : "failed",
      last_verification_message: record.message.slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" }
  );
}

// ── Demo-mode in-memory records (per server process) ────────────────────────

const demoRecords = new Map<string, VerificationRecord>();

export function getDemoVerificationRecord(
  workspaceId: string,
  integrationId: string
): VerificationRecord | null {
  return demoRecords.get(`${workspaceId}:${integrationId}`) ?? null;
}

export function setDemoVerificationRecord(
  workspaceId: string,
  integrationId: string,
  record: VerificationRecord
): void {
  demoRecords.set(`${workspaceId}:${integrationId}`, record);
}
