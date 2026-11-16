import { NextResponse } from "next/server";
import {
  ALL_OAUTH_SCOPES,
  getClaudePublicUrl,
  getMcpResourceUrl,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource/api/mcp/claude — RFC 9728
 * OAuth Protected Resource Metadata for the Claude MCP resource.
 *
 * The MCP server itself lives at /api/mcp/claude; this document tells
 * Claude where to authorize (`authorization_servers`) and which scopes
 * exist. Claude probes this path-scoped location first
 * (`/.well-known/oauth-protected-resource/<mcp-path>`) before falling
 * back to the root document. The public origin is
 * CLAUDE_MCP_PUBLIC_URL when set, else MUSE_MCP_PUBLIC_URL, else
 * NEXT_PUBLIC_APP_URL, else the request origin. The root document at
 * /.well-known/oauth-protected-resource covers all three resources via
 * `?resource=`; this path-scoped document describes the Claude
 * resource specifically.
 */
export async function GET(req: Request) {
  const origin = getClaudePublicUrl(new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    resource: getMcpResourceUrl(origin, "claude"),
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
