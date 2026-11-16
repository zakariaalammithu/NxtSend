/**
 * POST /api/mcp — NxtSend MCP server (stateless Streamable HTTP).
 *
 * JSON-RPC 2.0 over POST. Auth is a Muse OAuth access token
 * (Authorization: Bearer …) resolved by Worker A's resolveMuseContext;
 * demo mode answers 503 and never serves the demo persona.
 */

import { NextResponse } from "next/server";
import {
  handleMcpRequest,
  jsonResponse,
  readMcpBody,
} from "@/lib/muse-connector/mcp";
import { resolveMuseContext } from "@/lib/muse-connector/context";
import { isMuseMcpEnabled } from "@/lib/muse-connector/oauth/config";
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
    mcpEnabled: isMuseMcpEnabled(),
    request: req,
    body: parsed.value,
    resolveContext: resolveMuseContext,
  });
  return jsonResponse(result);
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed: this endpoint only accepts POST (JSON-RPC 2.0)." },
    { status: 405 }
  );
}
