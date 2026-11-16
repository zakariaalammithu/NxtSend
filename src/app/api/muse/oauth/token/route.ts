import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import {
  createSupabaseMuseOAuthStore,
  handleMuseTokenRequest,
  recordMuseOAuthEvent,
  toNextResponse,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/muse/oauth/token — OAuth 2.1 token endpoint.
 *
 * grant_types: `authorization_code` (single-use code + PKCE S256
 * verifier) and `refresh_token` (rotates on every use; reuse of an
 * already-rotated refresh token revokes the whole grant). Public
 * clients send no secret; confidential clients authenticate with
 * client_secret (body or HTTP Basic). Demo Mode refuses: no token
 * is ever issued for the demo persona.
 */
export async function POST(req: Request) {
  if (getDataMode() === "demo") {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Muse OAuth is unavailable in Demo Mode." },
      { status: 400 }
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "temporarily_unavailable", error_description: "The OAuth server is not configured." },
      { status: 503 }
    );
  }
  const result = await handleMuseTokenRequest(req, {
    store: createSupabaseMuseOAuthStore(admin),
    audit: async (event) => {
      await recordMuseOAuthEvent({ ...event, admin });
    },
  });
  return toNextResponse(result);
}
