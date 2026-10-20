import { handleOAuthConnect } from "@/lib/oauth/handlers";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/microsoft/connect
 *
 * Starts the Outlook (Microsoft 365) OAuth flow against the
 * Microsoft identity platform (tenant "common"): session +
 * workspace guarded, then a redirect to Microsoft's consent screen
 * with a signed state — or back to the Outlook integration page
 * with an honest oauth_error when the flow cannot run (Demo Mode /
 * missing env config). No password is ever asked for.
 */
export async function GET(req: Request) {
  return handleOAuthConnect("microsoft", req);
}
