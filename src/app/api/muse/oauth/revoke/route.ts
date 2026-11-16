import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import {
  createSupabaseMuseOAuthStore,
  handleMuseRevokeRequest,
  recordMuseOAuthEvent,
  toNextResponse,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/muse/oauth/revoke — RFC 7009 token revocation.
 *
 * Revoking a refresh token revokes the whole grant (all tokens for
 * that client + user); revoking an access token revokes just that
 * token. Always answers 200 for unknown tokens. Demo Mode refuses.
 */
export async function POST(req: Request) {
  if (getDataMode() === "demo") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Muse OAuth is unavailable in Demo Mode." },
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
  const result = await handleMuseRevokeRequest(req, {
    store: createSupabaseMuseOAuthStore(admin),
    audit: async (event) => {
      await recordMuseOAuthEvent({ ...event, admin });
    },
  });
  return toNextResponse(result);
}
