import { NextResponse } from "next/server";
import {
  ALL_OAUTH_SCOPES,
  getChatGptPublicUrl,
  getMcpResourceUrl,
} from "@/lib/muse-connector/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /.well-known/oauth-protected-resource/api/mcp/chatgpt — RFC 9728
 * OAuth Protected Resource Metadata for the ChatGPT MCP resource.
 *
 * The MCP server itself lives at /api/mcp/chatgpt; this document tells
 * ChatGPT where to authorize (`authorization_servers`) and which scopes
 * exist. The public origin is CHATGPT_MCP_PUBLIC_URL when set, else
 * MUSE_MCP_PUBLIC_URL, else NEXT_PUBLIC_APP_URL, else the request
 * origin. The root document at /.well-known/oauth-protected-resource
 * covers both resources via `?resource=`; this path-scoped document
 * describes the ChatGPT resource specifically.
 */
export async function GET(req: Request) {
  const origin = getChatGptPublicUrl(new URL(req.url).origin);
  if (!origin) {
    return NextResponse.json(
      { error: "The public URL of this deployment is not configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    resource: getMcpResourceUrl(origin, "chatgpt"),
    authorization_servers: [origin],
    scopes_supported: [...ALL_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
