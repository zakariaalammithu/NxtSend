/**
 * Unsubscribe service — the testable core behind
 * GET/POST /api/unsubscribe/[token].
 *
 * Flow: verify the signed token → write the suppression (reason
 * exactly `unsubscribed`, per the product contract) → stop the
 * recipient's active sequence enrollments in that workspace
 * (belt-and-braces: the executor's stop rules already refuse at send
 * time, but a stopped enrollment also disappears from due-step scans).
 *
 * Security invariants:
 *  - The token is the ONLY credential — it is HMAC-signed and carries
 *    exactly one (workspace, email) pair. Nothing here ever touches
 *    another workspace or reveals whether an address exists anywhere
 *    else: an unknown-but-validly-signed pair is simply recorded.
 *  - Idempotent: unsubscribing twice returns "already" and never
 *    writes a duplicate row (the store enforces the unique pair).
 *  - Invalid/tampered tokens return "invalid" with zero side effects.
 *
 * Enrollment stop: live mode uses the service-role client (the
 * endpoint is public — no session exists). Demo mode has no
 * server-side enrollments (they live in the browser demo store), so
 * the stopper is a no-op there and the demo executor stops the
 * enrollment via its suppression signal instead — documented, not
 * hidden.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { normalizeEmail } from "./suppression";
import {
  createDemoSuppressionStore,
  createSupabaseSuppressionStore,
  type SuppressionStore,
} from "./suppression-store";
import {
  verifyUnsubscribeToken,
  type UnsubscribeEnv,
} from "./unsubscribe";

export const UNSUBSCRIBED_REASON = "unsubscribed";

export type UnsubscribeOutcome =
  | {
      outcome: "unsubscribed" | "already";
      workspaceId: string;
      email: string;
      stoppedEnrollments: number;
    }
  | { outcome: "invalid" };

export interface UnsubscribeServiceDeps {
  store: SuppressionStore;
  /** Stops active enrollments for (workspace, email); returns the count. */
  stopEnrollments?: (workspaceId: string, email: string) => Promise<number>;
  env?: UnsubscribeEnv;
  mode?: DataMode;
}

export async function performUnsubscribe(
  deps: UnsubscribeServiceDeps,
  token: string
): Promise<UnsubscribeOutcome> {
  const claims = verifyUnsubscribeToken(token, deps.env, deps.mode);
  if (!claims) return { outcome: "invalid" };

  const { entry, created } = await deps.store.add(
    claims.workspaceId,
    claims.email,
    UNSUBSCRIBED_REASON
  );

  let stoppedEnrollments = 0;
  if (deps.stopEnrollments) {
    try {
      stoppedEnrollments = await deps.stopEnrollments(
        claims.workspaceId,
        entry.email
      );
    } catch {
      // The suppression is the compliance-critical write and it has
      // already landed; the executor's stop rules honour it at send
      // time even if the enrollment sweep fails. Never fail the
      // unsubscribe because of the belt-and-braces step.
      stoppedEnrollments = 0;
    }
  }

  return {
    outcome: created ? "unsubscribed" : "already",
    workspaceId: claims.workspaceId,
    email: entry.email,
    stoppedEnrollments,
  };
}

/**
 * Live-mode enrollment stopper over the service-role client: finds the
 * workspace's leads with this email and flips their pending/active
 * enrollments to "stopped" (a status the executor already treats as
 * terminal — see EnrollmentStatus).
 */
export function createSupabaseEnrollmentStopper(admin: SupabaseClient) {
  return async (workspaceId: string, email: string): Promise<number> => {
    const target = normalizeEmail(email);
    const { data: leads, error: leadError } = await admin
      .from("leads")
      .select("id, email")
      .eq("workspace_id", workspaceId)
      .limit(200);
    if (leadError) {
      throw new Error(`Enrollment stop failed: ${leadError.message}`);
    }
    const leadIds = (leads ?? [])
      .filter(
        (l) => normalizeEmail(String((l as { email?: string }).email ?? "")) === target
      )
      .map((l) => String((l as { id: string }).id));
    if (leadIds.length === 0) return 0;
    const { data, error } = await admin
      .from("campaign_enrollments")
      .update({ status: "stopped" })
      .in("lead_id", leadIds)
      .in("status", ["pending", "active"])
      .select("id");
    if (error) {
      throw new Error(`Enrollment stop failed: ${error.message}`);
    }
    return (data ?? []).length;
  };
}

/**
 * Builds the deps for the current runtime: demo → demo store, no
 * stopper (see header); live → service-role store + stopper. Returns
 * null in live mode when no service-role client exists (the endpoint
 * then answers 503 — it must never pretend to have recorded an
 * unsubscribe it could not write).
 */
export function resolveUnsubscribeDeps(
  admin: SupabaseClient | null
): UnsubscribeServiceDeps | null {
  const mode = getDataMode();
  if (mode === "demo") {
    return { store: createDemoSuppressionStore(), mode };
  }
  if (!admin) return null;
  return {
    store: createSupabaseSuppressionStore(admin),
    stopEnrollments: createSupabaseEnrollmentStopper(admin),
    mode,
  };
}
