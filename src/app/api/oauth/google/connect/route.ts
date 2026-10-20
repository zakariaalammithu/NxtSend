import { handleOAuthConnect } from "@/lib/oauth/handlers";

export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/google/connect
 *
 * Starts the Gmail OAuth flow: session + workspace guarded, then a
 * redirect to Google's consent screen with a signed state — or back
 * to the Gmail integration page with an honest oauth_error when the
 * deployment cannot run the flow (Demo Mode / missing env config).
 * No password is ever asked for; Google hosts the consent.
 */
export async function GET(req: Request) {
  return handleOAuthConnect("google", req);
}
