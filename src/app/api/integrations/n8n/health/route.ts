import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/data/mode";
import { N8N_API_VERSION, isPlatformEnabled } from "@/lib/integrations/rest/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/n8n/health — public, no auth.
 * Lets n8n (and the owner) check the surface without a token:
 * which mode the deployment is in, whether n8n is enabled, and
 * the API version.
 */
export async function GET() {
  return NextResponse.json({
    mode: getDataMode(),
    n8nEnabled: isPlatformEnabled("n8n"),
    version: N8N_API_VERSION,
  });
}
