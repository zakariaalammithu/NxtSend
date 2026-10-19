/**
 * Suppression-list enforcement.
 *
 * The send path MUST consult the workspace suppression list before any
 * marketing email leaves the system (brief §2/§13). The pure matcher is
 * unit-tested; the store lookup is a thin service-role query over the
 * `suppression_list` table created by migration 001.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pure, case-insensitive membership check. */
export function isSuppressed(
  suppressedEmails: Iterable<string>,
  email: string
): boolean {
  const target = normalizeEmail(email);
  if (!target) return false;
  for (const entry of Array.from(suppressedEmails)) {
    if (normalizeEmail(entry) === target) return true;
  }
  return false;
}

/**
 * Loads the workspace suppression list and checks one recipient.
 * Throws on query failure — callers must treat a failed check as
 * "do not send" (fail closed), never as "not suppressed".
 */
export async function checkSuppression(
  admin: SupabaseClient,
  workspaceId: string,
  email: string
): Promise<boolean> {
  const { data, error } = await admin
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
}

/** Adds an address to the workspace suppression list (idempotent). */
export async function addSuppression(
  admin: SupabaseClient,
  workspaceId: string,
  email: string,
  reason: string
): Promise<void> {
  const { error } = await admin.from("suppression_list").upsert(
    {
      workspace_id: workspaceId,
      email: normalizeEmail(email),
      reason,
    },
    { onConflict: "workspace_id,email", ignoreDuplicates: true }
  );
  if (error) {
    throw new Error(`Failed to record suppression: ${error.message}`);
  }
}
