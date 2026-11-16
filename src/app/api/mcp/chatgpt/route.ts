/**
 * POST /api/mcp/chatgpt — NxtSend MCP server for ChatGPT (stateless
 * Streamable HTTP, JSON-RPC 2.0).
 *
 * Shares the handler code with /api/mcp (handleMcpRequest, flavor
 * "chatgpt"): initialize, tools/list and resources/list are readable
 * without a token (static metadata only — each tool is annotated as
 * requiring OAuth, no data is returned); tool calls and
 * resources/read require a valid token (missing/invalid -> 401 with
 * WWW-Authenticate, same as /api/mcp in live mode); a call whose
 * grant lacks the required scope answers with a structured reconnect
 * prompt (a normal tool result with isError: true, not a transport
 * error). Demo mode -> 503 not_configured, same as /api/mcp.
 */

import { NextResponse } from "next/server";
import {
  handleMcpRequest,
  jsonResponse,
  readMcpBody,
} from "@/lib/muse-connector/mcp";
import { resolveMuseContext } from "@/lib/muse-connector/context";
import { isChatGptMcpEnabled } from "@/lib/muse-connector/oauth/config";
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
    mcpEnabled: isChatGptMcpEnabled(),
    request: req,
    body: parsed.value,
    resolveContext: resolveMuseContext,
    flavor: "chatgpt",
  });
  return jsonResponse(result);
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed: this endpoint only accepts POST (JSON-RPC 2.0)." },
    { status: 405 }
  );
}
