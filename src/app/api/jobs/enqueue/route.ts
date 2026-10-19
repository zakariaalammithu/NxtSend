import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resolveServerWorkspaceId } from "@/lib/server/workspace";
import { getDataMode } from "@/lib/data/mode";
import { enqueueFollowUpScan } from "@/lib/jobs/producer";

export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/enqueue — the follow_up_due producer endpoint.
 *
 * Called (fire-and-forget) by the data layer when a campaign becomes
 * active, so due sequence steps get scanned by the worker without
 * waiting for the next day's cron-created scan. The workspace is
 * resolved from the caller's SESSION (never from the request body),
 * and the job row is written with the service role (jobs has no
 * client write policies).
 *
 * Demo Mode: there is no server-side queue to enqueue into — demo
 * sequences run through the in-app demo runner — so the route answers
 * 200 with an explicit `enqueued: false` and the reason, letting the
 * client's fire-and-forget call succeed honestly.
 */
export async function POST() {
  if (getDataMode() === "demo") {
    return NextResponse.json({
      mode: "demo",
      enqueued: false,
      note: "Demo Mode: no server job queue exists. Due steps run via the in-app demo runner on the campaign page.",
    });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured.", mode: "demo", enqueued: false },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await resolveServerWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace found for this account.", enqueued: false },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured; the scan job could not be enqueued.",
        enqueued: false,
      },
      { status: 503 }
    );
  }

  const created = await enqueueFollowUpScan(admin, workspaceId);
  return NextResponse.json({
    mode: "live",
    enqueued: created,
    note: created
      ? "A follow_up_due scan job was enqueued for this workspace; the worker (Vercel Cron or POST /api/jobs/run) will execute due steps."
      : "Today's follow_up_due scan for this workspace was already enqueued; due steps are covered by it.",
  });
}
