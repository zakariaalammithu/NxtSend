import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { isConfiguredValue } from "@/lib/env";
import { processDueScheduledRepliesLive } from "@/lib/scheduled-replies/process";

/**
 * /api/cron/scheduled-replies — sends due scheduled inbox replies.
 *
 * Auth is the same CRON_SECRET pattern as POST /api/jobs/run: Vercel
 * Cron sends GET with `Authorization: Bearer <CRON_SECRET>` (set
 * automatically when CRON_SECRET exists in the project env); POST
 * with either that header or `x-cron-secret` works too, for manual /
 * external schedulers. When CRON_SECRET is unset the route refuses
 * (503) — an unauthenticated send trigger is never armed. The
 * comparison is constant-time (hash-then-compare).
 *
 * Sending reuses the existing sendInboxReply path with a stable
 * idempotency key (`scheduled_<row id>`), so a repeated tick can
 * never double-send. Due rows move to sent / simulated / failed;
 * cancelled and future rows are untouched.
 *
 * Demo Mode: scheduled replies live in the browser demo store, which
 * this worker cannot read — the Inbox page marks due demo rows
 * `simulated` when it loads them. This route reports that honestly
 * and sends nothing.
 *
 * Scheduling (Vercel): the daily POST /api/jobs/run cron (06:00,
 * vercel.json) already processes due scheduled replies as part of its
 * run, so this route is only needed for sub-daily delivery. Add a
 * cron entry for it (e.g. every 15 minutes) on a plan that allows
 * sub-daily crons; see the batch report for the exact entry.
 */

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function providedSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return req.headers.get("x-cron-secret");
}

async function handle(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!isConfiguredValue(cronSecret)) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured. The scheduled-replies worker is disabled rather than left unauthenticated (see SETUP.md).",
      },
      { status: 503 }
    );
  }
  if (!secretsMatch(providedSecret(req), cronSecret as string)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (getDataMode() === "demo") {
    return NextResponse.json({
      mode: "demo",
      checked: 0,
      sent: 0,
      simulated: 0,
      failed: 0,
      note: "Demo Mode: scheduled replies live in the browser demo store, which this worker cannot read. The Inbox page marks due demo rows simulated when it loads them — nothing is actually sent.",
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 503 }
    );
  }

  const summary = await processDueScheduledRepliesLive(admin);
  return NextResponse.json({ mode: "live", ...summary });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
