import { NextResponse } from "next/server";
import {
  ALL_OAUTH_SCOPES,
  getMcpResourceUrl,
  getMusePublicUrl,
  resourcePlatform,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource — RFC 9728 OAuth
 * Protected Resource Metadata (root document).
 *
 * The resource this document describes is the MCP resource the
 * request is about: pass `?resource=<MCP resource URL>` and, when
 * it names one of the two canonical MCP resources, that resource
 * is returned; otherwise the canonical Muse MCP resource
 * (`<origin>/api/mcp`) is returned. The path-scoped variant at
 * /.well-known/oauth-protected-resource/api/mcp describes the Muse
 * resource specifically and keeps working unchanged.
 */
export async function GET(req: Request) {
  const origin = getMusePublicUrl(new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  const requested = new URL(req.url).searchParams.get("resource");
  let resource = getMcpResourceUrl(origin, "muse");
  if (requested) {
    const platform = resourcePlatform(requested);
    if (platform) {
      resource = getMcpResourceUrl(origin, platform);
    }
  }
  return NextResponse.json({
    resource,
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
