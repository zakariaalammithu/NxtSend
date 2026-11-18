import { NextResponse } from "next/server";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth/scopes";
import { getAlbatoResourceUrl } from "@/lib/muse-connector/oauth/config";
import { getPlatformBaseUrl } from "@/lib/integrations/rest/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource/api/integrations/albato
 * — RFC 9728 OAuth Protected Resource Metadata for the Albato REST
 * API resource (`<origin>/api/integrations/albato`).
 *
 * Albato is not an MCP server, but it authenticates with the same
 * OAuth 2.0 authorization server, so it gets the same metadata
 * treatment as Zapier/n8n: this document tells Albato where to authorize
 * (`authorization_servers`) and which scopes exist. The public
 * origin is ALBATO_API_BASE_URL when set, else NEXT_PUBLIC_APP_URL,
 * else the request origin. The root document at
 * /.well-known/oauth-protected-resource also resolves this resource
 * via `?resource=`.
 */
export async function GET(req: Request) {
  const origin = getPlatformBaseUrl("albato", new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    resource: getAlbatoResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
