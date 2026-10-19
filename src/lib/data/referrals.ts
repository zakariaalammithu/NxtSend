/**
 * Referrals repository — attribution records for the CURRENT user
 * (the people who signed up through their referral link).
 *
 * - Supabase backend: the `referrals` table (migration 008) through
 *   the session client; RLS restricts reads to the referrer's own
 *   rows. Recording happens through POST /api/referrals/record (the
 *   signup/login capture flow), not from this repository.
 * - Demo backend: the demo store, seeded with two clearly-labelled
 *   sample records for the demo persona. Nothing in Demo Mode records
 *   new referrals — there are no real signups to attribute — and the
 *   page says so.
 *
 * Rewards are NOT modelled: no reward rules have been defined by the
 * product owner, so this module tracks attribution only.
 */

import { createClient } from "@/lib/supabase/client";
import { getDataMode, type DataMode } from "./mode";
import { getDemoStorage } from "./demo-store";
import { DEMO_USER_ID } from "./workspace";

export interface ReferralRecord {
  id: string;
  referrer_id: string;
  referred_user_id: string | null;
  referred_email: string;
  status: "signed_up" | "pending";
  created_at: string;
  is_demo: boolean;
}

export interface ReferralsRepository {
  readonly mode: DataMode;
  /** Referral records made BY the given user, newest first. */
  listReferrals(referrerId: string): Promise<ReferralRecord[]>;
}

// ── Demo backend ────────────────────────────────────────────────────────────

const DEMO_REFERRALS_KEY = "nxtsend_demo_referrals_v1";

const DEMO_SEED: ReferralRecord[] = [
  {
    id: "ref_demo_001",
    referrer_id: DEMO_USER_ID,
    referred_user_id: "usr_demo_referred_001",
    referred_email: "maria@northbeam-demo.com",
    status: "signed_up",
    created_at: "2024-10-08T14:22:00.000Z",
    is_demo: true,
  },
  {
    id: "ref_demo_002",
    referrer_id: DEMO_USER_ID,
    referred_user_id: null,
    referred_email: "tom@loopwork-demo.io",
    status: "pending",
    created_at: "2024-10-11T09:05:00.000Z",
    is_demo: true,
  },
];

function loadDemoReferrals(): ReferralRecord[] {
  try {
    const raw = getDemoStorage().getItem(DEMO_REFERRALS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ReferralRecord[];
    }
  } catch {
    // reseed below
  }
  try {
    getDemoStorage().setItem(DEMO_REFERRALS_KEY, JSON.stringify(DEMO_SEED));
  } catch {
    // best-effort persistence in demo mode
  }
  return [...DEMO_SEED];
}

class DemoReferralsRepository implements ReferralsRepository {
  readonly mode: DataMode = "demo";

  async listReferrals(referrerId: string): Promise<ReferralRecord[]> {
    return loadDemoReferrals()
      .filter((r) => r.referrer_id === referrerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

// ── Supabase backend ────────────────────────────────────────────────────────

class SupabaseReferralsRepository implements ReferralsRepository {
  readonly mode: DataMode = "supabase";

  async listReferrals(referrerId: string): Promise<ReferralRecord[]> {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    const { data, error } = await supabase
      .from("referrals")
      .select("id, referrer_id, referred_user_id, referred_email, status, created_at")
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load referrals: ${error.message}`);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        referrer_id: String(r.referrer_id),
        referred_user_id: (r.referred_user_id as string | null) ?? null,
        referred_email: String(r.referred_email ?? ""),
        status: r.status === "pending" ? "pending" : "signed_up",
        created_at: String(r.created_at ?? new Date().toISOString()),
        is_demo: false,
      } satisfies ReferralRecord;
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createReferralsRepository(
  mode: DataMode = getDataMode()
): ReferralsRepository {
  return mode === "supabase"
    ? new SupabaseReferralsRepository()
    : new DemoReferralsRepository();
}

let cached: ReferralsRepository | null = null;

export function getReferralsRepository(): ReferralsRepository {
  if (!cached) cached = createReferralsRepository(getDataMode());
  return cached;
}
