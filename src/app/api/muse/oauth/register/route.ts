import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import {
  createDcrRateLimiter,
  createSupabaseMuseOAuthStore,
  handleMuseRegisterRequest,
  recordMuseOAuthEvent,
  toNextResponse,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/muse/oauth/register — RFC 7591 Dynamic Client
 * Registration. Accepts `client_name` + `redirect_uris` only; every
 * other field is ignored. Default public client (no secret); a
 * confidential client is created only when
 * `token_endpoint_auth_method` is explicitly `client_secret_post`
 * or `client_secret_basic`. Rate-limited per IP (burst of 5, then
 * 1 per 6 minutes). Demo Mode refuses.
 */

const limiter = createDcrRateLimiter();

export async function POST(req: Request) {
  if (getDataMode() === "demo") {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Muse OAuth is unavailable in Demo Mode." },
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
  const result = await handleMuseRegisterRequest(req, {
    store: createSupabaseMuseOAuthStore(admin),
    limiter,
    audit: async (event) => {
      await recordMuseOAuthEvent({ ...event, admin });
    },
  });
  return toNextResponse(result);
}
