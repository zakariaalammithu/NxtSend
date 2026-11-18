import { NextResponse } from "next/server";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth/scopes";
import { getPabblyResourceUrl } from "@/lib/muse-connector/oauth/config";
import { getPlatformBaseUrl } from "@/lib/integrations/rest/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource/api/integrations/pabbly
 * — RFC 9728 OAuth Protected Resource Metadata for the Pabbly Connect REST
 * API resource (`<origin>/api/integrations/pabbly`).
 *
 * Pabbly Connect is not an MCP server, but it authenticates with the same
 * OAuth 2.0 authorization server, so it gets the same metadata
 * treatment as Zapier/n8n: this document tells Pabbly Connect where to authorize
 * (`authorization_servers`) and which scopes exist. The public
 * origin is PABBLY_API_BASE_URL when set, else NEXT_PUBLIC_APP_URL,
 * else the request origin. The root document at
 * /.well-known/oauth-protected-resource also resolves this resource
 * via `?resource=`.
 */
export async function GET(req: Request) {
  const origin = getPlatformBaseUrl("pabbly", new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    resource: getPabblyResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
