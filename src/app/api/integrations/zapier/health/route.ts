import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/data/mode";
import { ZAPIER_API_VERSION, isZapierEnabled } from "@/lib/integrations/zapier/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/zapier/health — public, no auth.
 * Lets the Zapier app (and the owner) check the surface without a
 * token: which mode the deployment is in, whether Zapier is
 * enabled, and the API version.
 */
export async function GET() {
  return NextResponse.json({
    mode: getDataMode(),
    zapierEnabled: isZapierEnabled(),
    version: ZAPIER_API_VERSION,
  });
}
