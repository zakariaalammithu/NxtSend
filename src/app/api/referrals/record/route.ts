import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { parseReferralCode, validateReferralCapture } from "@/lib/referrals/core";

export const dynamic = "force-dynamic";

/**
 * POST /api/referrals/record  { ref }
 *
 * Records the referral attribution for the JUST-SIGNED-UP caller:
 * the signup (or first-login) flow calls this when a referral code
 * was captured from /signup?ref=<referrer user id>.
 *
 * Rules (all enforced server-side):
 *  - Demo Mode records nothing — there are no real accounts to
 *    attribute. The response says so plainly.
 *  - A session is required; the referred user is ALWAYS the caller
 *    (never taken from the body), matching the migration-008 INSERT
 *    policy (referred_user_id = auth.uid()).
 *  - Self-referral is a no-op. The referrer must exist in profiles.
 *  - One referral per referred account (unique index) — a retry
 *    returns the existing record instead of duplicating.
 *  - No reward is granted: reward rules are not configured.
 */
export async function POST(req: Request) {
  const mode = getDataMode();
  if (mode === "demo") {
    return NextResponse.json({
      mode,
      recorded: false,
      message:
        "Demo Mode: referrals are not recorded because no real account was created.",
    });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: { ref?: unknown };
  try {
    body = (await req.json()) as { ref?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = parseReferralCode(
    typeof body.ref === "string" ? `ref=${encodeURIComponent(body.ref)}` : null
  );
  const decision = validateReferralCapture({ code, newUserId: user.id });
  if (!decision.ok) {
    // Missing/self codes are not errors for the signup flow — the
    // account exists either way; attribution simply doesn't apply.
    return NextResponse.json({ mode, recorded: false, reason: decision.reason });
  }

  const { data: referrer } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", code as string)
    .maybeSingle();
  if (!referrer) {
    return NextResponse.json({ mode, recorded: false, reason: "unknown_referrer" });
  }

  const { data: existing } = await supabase
    .from("referrals")
    .select("id")
    .eq("referred_user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ mode, recorded: true, alreadyRecorded: true });
  }

  const { error } = await supabase.from("referrals").insert({
    referrer_id: code as string,
    referred_user_id: user.id,
    referred_email: user.email ?? "",
    status: "signed_up",
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to record referral: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ mode, recorded: true });
}
