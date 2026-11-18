import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/data/mode";
import { N8N_API_VERSION, isPlatformEnabled } from "@/lib/integrations/rest/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/albato/health — public, no auth.
 * Lets Albato (and the owner) check the surface without a token:
 * which mode the deployment is in, whether Albato is enabled, and
 * the API version. The version is the shared REST API version
 * (N8N_API_VERSION) — one version across all REST platforms.
 */
export async function GET() {
  return NextResponse.json({
    mode: getDataMode(),
    albatoEnabled: isPlatformEnabled("albato"),
    version: N8N_API_VERSION,
  });
}
