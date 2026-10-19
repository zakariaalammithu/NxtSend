import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { isConfiguredValue } from "@/lib/env";
import { runDueJobs } from "@/lib/jobs/runner";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { createSupabaseJobStore, InMemoryJobStore } from "@/lib/jobs/store";
import { createSupabaseJobsContext } from "@/lib/jobs/context";
import type { JobsContext } from "@/lib/jobs/types";

/**
 * /api/jobs/run — background job worker, invoked by Vercel Cron.
 *
 * Vercel Cron sends GET with `Authorization: Bearer <CRON_SECRET>`
 * (Vercel sets that header automatically when CRON_SECRET exists in the
 * project env). POST with either that header or `x-cron-secret` works
 * too, for manual/external schedulers. When CRON_SECRET is unset the
 * route refuses (503) — an unauthenticated job trigger is never armed.
 * The comparison is constant-time (hash-then-compare, like the admin
 * bootstrap route).
 *
 * In Demo Mode there is no database: the runner executes against
 * in-memory stores (empty unless seeded in-process) and the response is
 * labelled demo — nothing persistent is claimed.
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
          "CRON_SECRET is not configured. The jobs worker is disabled rather than left unauthenticated (see SETUP.md).",
      },
      { status: 503 }
    );
  }
  if (!secretsMatch(providedSecret(req), cronSecret as string)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin || getDataMode() === "demo") {
    const summary = await runDueJobs({
      store: new InMemoryJobStore(),
      ctx: emptyContext(),
      handlers: createJobHandlers(),
    });
    return NextResponse.json({
      mode: "demo",
      ...summary,
      note: "Demo Mode: no database is connected, so no persistent jobs exist. Summary covers in-memory jobs only (normally zero).",
    });
  }

  const summary = await runDueJobs({
    store: createSupabaseJobStore(admin),
    ctx: createSupabaseJobsContext(admin),
    handlers: createJobHandlers(),
  });
  return NextResponse.json({ mode: "live", ...summary });
}

function emptyContext(): JobsContext {
  return {
    async listWorkspaces() {
      return [];
    },
    async getWorkspacePlan() {
      return "free";
    },
    async countWorkspaceMetric() {
      return 0;
    },
    async upsertUsageRecord() {},
    async listDueWebhookRetries() {
      return [];
    },
    async retryWebhookDelivery() {
      return { status: "no_config" };
    },
    getSequenceExecutor() {
      // Demo Mode server context: demo data lives in the browser demo
      // store, which this worker cannot read. The follow_up_due
      // handler records an honest skip; demo sequences execute via
      // the in-app demo runner (campaign page).
      return null;
    },
  };
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
