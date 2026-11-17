import { NextResponse } from "next/server";
import { withRestRoute, readRestJsonBody } from "@/lib/integrations/rest/route-helpers";
import { N8N_PLATFORM } from "@/lib/integrations/rest/config";
import { restImportLeads } from "@/lib/integrations/rest/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /v1/leads/import — bulk create (max 100; returns created/skipped counts). */
export async function POST(req: Request) {
  const body = await readRestJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  return withRestRoute(req, N8N_PLATFORM, "write", (ctx, deps) => restImportLeads(ctx, deps, body));
}
