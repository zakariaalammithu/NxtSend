import { NextResponse } from "next/server";
import { getSupportConfig } from "@/lib/support/public-service";
import { withSupportStore } from "@/lib/support/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/config — public-safe widget configuration:
 * settings-derived display name + copy, which modes are on, whether
 * a support agent has declared themselves available, and the AI
 * enhancement's real configuration state. Never returns token
 * hashes, KB internals or agent identities.
 */
export async function GET() {
  return withSupportStore(async (store) => {
    const result = await getSupportConfig(store);
    const response = NextResponse.json(result.body, { status: result.status });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
