/**
 * GET /api/mcp/health — public MCP health (no secrets, no auth).
 * Reports the real config state: mode, whether MCP is enabled,
 * the manifest tool count (18), whether Muse OAuth is configured
 * (Worker A's server), and the server version.
 */

import { NextResponse } from "next/server";
import { NXTSEND_TOOL_MANIFEST } from "@/lib/muse-connector/manifest";
import { isMuseOAuthConfigured } from "@/lib/muse-connector/tokens";
import { isMuseMcpEnabled } from "@/lib/muse-connector/oauth/config";
import { MCP_PROTOCOL_VERSION, MCP_SERVER_VERSION } from "@/lib/muse-connector/mcp";
import { getDataMode } from "@/lib/data/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    mode: getDataMode(),
    mcpEnabled: isMuseMcpEnabled(),
    toolCount: NXTSEND_TOOL_MANIFEST.length,
    oauthConfigured: isMuseOAuthConfigured(),
    protocolVersion: MCP_PROTOCOL_VERSION,
    version: MCP_SERVER_VERSION,
  });
}
