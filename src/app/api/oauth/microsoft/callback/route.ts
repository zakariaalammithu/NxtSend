import { handleOAuthCallbackRoute } from "@/lib/oauth/handlers";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/microsoft/callback
 *
 * Microsoft's OAuth redirect target (register this exact URL in the
 * Azure app registration — SETUP.md §15). Verifies the signed state
 * against the session, exchanges the code, fetches the Graph /me
 * profile, and stores the grant encrypted (migration 014). Every
 * outcome redirects to Connected Accounts with a success or error
 * notice; failures store nothing.
 */
export async function GET(req: Request) {
  return handleOAuthCallbackRoute("microsoft", req);
}
