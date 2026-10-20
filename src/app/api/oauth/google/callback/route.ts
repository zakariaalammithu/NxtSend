import { handleOAuthCallbackRoute } from "@/lib/oauth/handlers";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/google/callback
 *
 * Google's OAuth redirect target (register this exact URL in the
 * Google Cloud Console — SETUP.md §15). Verifies the signed state
 * against the session, exchanges the code, fetches the Gmail
 * profile, and stores the grant encrypted (migration 014). Every
 * outcome redirects to Connected Accounts with a success or error
 * notice; failures store nothing.
 */
export async function GET(req: Request) {
  return handleOAuthCallbackRoute("google", req);
}
