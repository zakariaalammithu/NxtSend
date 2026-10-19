"use client";

import * as React from "react";
import { Link2, Copy, Check, Gift, Users, Clock, UserCheck, AlertTriangle } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { getReferralsRepository, type ReferralRecord } from "@/lib/data/referrals";
import { getUserSettingsRepository } from "@/lib/data/user-settings";
import { buildReferralLink } from "@/lib/referrals/core";
import { formatDate } from "@/lib/utils";

/**
 * Referral — honest minimum (Stage E).
 *
 * The referral link is derived from the signed-in user's id. Records
 * come from the referrals table (migration 008) in live mode, via
 * POST /api/referrals/record captured during signup/login; in Demo
 * Mode they come from the demo store and are labelled demo data.
 * REFERRAL REWARDS ARE NOT CONFIGURED: no reward rules exist in
 * settings, so this page promises and tracks nothing.
 */

export default function ReferralPage() {
  const referralsRepo = React.useMemo(() => getReferralsRepository(), []);
  const settingsRepo = React.useMemo(() => getUserSettingsRepository(), []);
  const isDemo = referralsRepo.mode === "demo";

  const [userId, setUserId] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<ReferralRecord[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await settingsRepo.getSettings();
        if (cancelled) return;
        setUserId(settings.identity.id);
        const rows = await referralsRepo.listReferrals(settings.identity.id);
        if (cancelled) return;
        setRecords(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load referrals.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referralsRepo, settingsRepo]);

  const appOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : // SSR fallback only (the browser always uses its real origin).
        // Never emit a localhost link from a production render: with
        // the env unset this yields a relative /signup link instead.
        (process.env.NEXT_PUBLIC_APP_URL ?? "");
  const referralLink = userId ? buildReferralLink(appOrigin, userId) : "";

  const signedUp = records.filter((r) => r.status === "signed_up").length;
  const pending = records.filter((r) => r.status === "pending").length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link and copy it manually.");
    }
  };

  return (
    <div className="space-y-7 pb-14 max-w-4xl">
      {isDemo && <DemoBanner feature="Referral" />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Referral Program
          </h1>
          {isDemo && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Share your personal link. When someone signs up through it, the
          referral is recorded to your account.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Referral link */}
      <div className="glass-card p-6 sm:p-8 space-y-4">
        <h2 className="text-16 font-semibold text-white flex items-center gap-2">
          <Link2 className="h-5 w-5 text-purple-400" />
          Your Referral Link
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            readOnly
            value={referralLink || "Loading your link…"}
            className="input-field flex-1 font-mono text-13"
            aria-label="Your referral link"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={!referralLink}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-50"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-300" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span>{copied ? "Copied!" : "Copy link"}</span>
          </button>
        </div>
        <p className="text-12 text-black-500">
          The link carries your referral code (<code>?ref=…</code>). The
          signup flow stashes it and records the referral after the new
          account is created — a person can never refer themselves, and a
          referral is recorded at most once per new account.
        </p>
      </div>

      {/* Stats — real records only */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-black-400">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="text-12 font-medium uppercase tracking-wider">Total referrals</span>
          </div>
          <p className="mt-2 text-28 font-bold text-white">{records.length}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-black-400">
            <UserCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-12 font-medium uppercase tracking-wider">Signed up</span>
          </div>
          <p className="mt-2 text-28 font-bold text-white">{signedUp}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-black-400">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-12 font-medium uppercase tracking-wider">Pending</span>
          </div>
          <p className="mt-2 text-28 font-bold text-white">{pending}</p>
        </div>
      </div>

      {/* Records */}
      <div className="glass-card p-6 sm:p-8 space-y-4">
        <h2 className="text-16 font-semibold text-white">Referral Records</h2>
        {records.length === 0 && (
          <p className="text-13 text-black-400">
            No referrals recorded yet. Share your link above — signups
            through it will appear here.
          </p>
        )}
        <div className="divide-y divide-black-700/60">
          {records.map((r) => (
            <div key={r.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-14 font-medium text-white truncate">
                  {r.referred_email ?? "New account"}
                </p>
                <p className="text-12 text-black-500">
                  Recorded {formatDate(r.created_at, "short")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.is_demo && <Badge variant="yellow">Demo record</Badge>}
                <Badge variant={r.status === "signed_up" ? "green" : "gray"}>
                  {r.status === "signed_up" ? "Signed up" : "Pending"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards — NOT configured, stated plainly */}
      <div className="glass-card p-6 sm:p-8 space-y-3">
        <h2 className="text-16 font-semibold text-white flex items-center gap-2">
          <Gift className="h-5 w-5 text-orange-400" />
          Referral Rewards
        </h2>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-13 text-amber-200">
          <strong className="text-white">Rewards are not configured.</strong>{" "}
          No referral reward rules exist for this product yet, so referrals
          are tracked but earn nothing at this time. Reward rules are an
          owner decision and will be published here before any reward is
          promised.
        </div>
      </div>
    </div>
  );
}
