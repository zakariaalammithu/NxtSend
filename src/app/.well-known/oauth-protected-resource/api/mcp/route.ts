import { NextResponse } from "next/server";
import { getMusePublicUrl, ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource/api/mcp — RFC 9728
 * OAuth Protected Resource Metadata for the Muse MCP resource.
 *
 * The MCP server itself (owned by the MCP worker) lives at
 * /api/mcp; this document tells Muse where to authorize
 * (`authorization_servers`) and which scopes exist. The public
 * origin is MUSE_MCP_PUBLIC_URL when set, else NEXT_PUBLIC_APP_URL,
 * else the request origin.
 */
export async function GET(req: Request) {
  const origin = getMusePublicUrl(new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
