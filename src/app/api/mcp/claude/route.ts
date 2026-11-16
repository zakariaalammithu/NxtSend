/**
 * POST /api/mcp/claude — NxtSend MCP server for Claude (stateless
 * Streamable HTTP, JSON-RPC 2.0).
 *
 * Shares the handler code with /api/mcp (handleMcpRequest, flavor
 * "claude"): like the Muse flavor, EVERY method needs a valid token
 * — there is no ChatGPT-style pre-auth discovery, so tools/list
 * without a token answers 401 with WWW-Authenticate naming the
 * Claude protected-resource metadata. Same 54 tools, same
 * annotations, same structuredContent, same scope enforcement
 * (Muse-style missing_scope error, not the ChatGPT reconnect
 * prompt), same 120 req/min per-grant rate limit. Demo mode -> 503
 * not_configured with the "Claude MCP" message. Additionally the
 * Claude flavor advertises prompts/list + prompts/get and returns
 * Claude-specific server instructions on initialize.
 */

import { NextResponse } from "next/server";
import {
  handleMcpRequest,
  jsonResponse,
  readMcpBody,
} from "@/lib/muse-connector/mcp";
import { resolveMuseContext } from "@/lib/muse-connector/context";
import { isClaudeMcpEnabled } from "@/lib/muse-connector/oauth/config";
import { getDataMode } from "@/lib/data/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await readMcpBody(req);
  if (!parsed.ok) {
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
  const result = await handleMcpRequest({
    mode: getDataMode(),
    mcpEnabled: isClaudeMcpEnabled(),
    request: req,
    body: parsed.value,
    resolveContext: resolveMuseContext,
    flavor: "claude",
  });
  return jsonResponse(result);
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed: this endpoint only accepts POST (JSON-RPC 2.0)." },
    { status: 405 }
  );
}
