/**
 * MCP server handler — stateless Streamable HTTP (JSON-RPC 2.0 over POST).
 *
 * Transport-agnostic core: src/app/api/mcp/route.ts only parses the
 * body and hands the request to handleMcpRequest with the real
 * resolveMuseContext + adapter factory; tests inject fakes through
 * the same seam (like handleDraftRequest's draftFn).
 *
 * Methods: initialize, notifications/initialized (no-op),
 * ping, tools/list, tools/call.
 *
 * Auth: Authorization: Bearer <access token>, resolved via
 * resolveMuseContext. Missing/invalid/expired -> 401 with
 * WWW-Authenticate naming the OAuth protected resource. No token
 * means no data, ever. Demo mode -> 503 not_configured (the demo
 * persona is never served to Muse).
 *
 * Rate limit: 120 req/min per grant (createRateLimiter pattern).
 * NOTE: the limiter is in-memory and per-process — on Vercel it does
 * not share state across instances, so it is a best-effort brake, not
 * a distributed guarantee; a persistent limiter is future work.
 *
 * Errors: JSON-RPC error objects (-32700 parse, -32600 invalid
 * request, -32601 method not found, -32602 invalid params, -32603
 * internal) plus NxtSend outcome statuses (SUCCESS/FAILED/BLOCKED…)
 * inside tool results. Uncertain outcomes are BLOCKED/FAILED with the
 * reason, never retried blindly.
 */

import { NextResponse } from "next/server";
import { NXTSEND_TOOL_MANIFEST } from "./manifest";
import { TOOL_INPUT_SCHEMAS, validateToolInput } from "./schemas";
import {
  createMuseConnectorAdapter,
  type MuseConnectorAdapter,
} from "./adapter";
import type { MuseGrantContext } from "./tokens";
import { createRateLimiter, type RateLimiter } from "@/lib/admin/submissions-core";
import { getMusePublicUrl } from "./oauth/config";
import type { DataMode } from "@/lib/data/mode";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_NAME = "nxtsend-mcp";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_RATE_LIMIT_PER_MINUTE = 120;
export const MCP_BODY_LIMIT_BYTES = 64 * 1024;

export function publicOrigin(req: Request): string {
  try {
    return getMusePublicUrl(new URL(req.url).origin) ?? new URL(req.url).origin;
  } catch {
    return "https://bom.b2bgdc.com";
  }
}

export function wwwAuthenticateHeader(req: Request): string {
  return `Bearer resource_metadata="${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp"`;
}

export interface McpHandleOptions {
  mode: DataMode;
  mcpEnabled: boolean;
  request: Request;
  /** Raw parsed JSON-RPC body (route already enforced the 64KB cap + JSON parse). */
  body: unknown;
  resolveContext: (req: Request) => Promise<MuseGrantContext | null>;
  createAdapter?: (ctx: MuseGrantContext) => MuseConnectorAdapter;
  /** Test seam: defaults to a module-level 120/min limiter. */
  rateLimiter?: RateLimiter;
  /** Test seam: clock for the rate limiter (defaults to Date.now). */
  nowMs?: () => number;
}

export interface McpHandleResult {
  status: number;
  headers?: Record<string, string>;
  /** null body => empty response (notification). */
  body: unknown | null;
}

const moduleRateLimiter = createRateLimiter({
  maxAttempts: MCP_RATE_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function buildToolsList(adapter: MuseConnectorAdapter) {
  return adapter.listTools().map((tool) => {
    const schema = TOOL_INPUT_SCHEMAS[tool.name];
    return {
      name: tool.name,
      description:
        `[${tool.classification}] ${tool.description} ` +
        `Side effects: ${tool.sideEffects} Inputs: ${tool.inputs}`,
      inputSchema: schema ?? { type: "object", properties: {} },
    };
  });
}

export async function handleMcpRequest(
  opts: McpHandleOptions
): Promise<McpHandleResult> {
  const { request, body } = opts;

  // Demo mode: the MCP surface is not served at all — the demo
  // persona must never be exposed to Muse as if it were a user.
  if (opts.mode === "demo") {
    return {
      status: 503,
      body: {
        error: "not_configured",
        message:
          "Muse MCP is not available in Demo Mode. Connect Supabase and configure Muse OAuth to enable it.",
      },
    };
  }
  if (!opts.mcpEnabled) {
    return {
      status: 503,
      body: {
        error: "not_configured",
        message: "Muse MCP is disabled (MUSE_MCP_ENABLED=false).",
      },
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: rpcError(null, -32600, "Invalid Request: expected a JSON-RPC object.") };
  }
  const msg = body as Record<string, unknown>;
  const id = msg.id ?? null;
  const method = typeof msg.method === "string" ? msg.method : "";

  // Notifications carry no id and get no response body (202).
  if (method === "notifications/initialized") {
    return { status: 202, body: null };
  }
  if (method === "notifications/cancelled") {
    return { status: 202, body: null };
  }

  if (msg.jsonrpc !== "2.0" || !method) {
    return { status: 400, body: rpcError(id, -32600, "Invalid Request: jsonrpc must be \"2.0\" and method must be a string.") };
  }

  // Auth: every method (including initialize) requires a valid grant.
  // No token -> no data, ever.
  const ctx = await opts.resolveContext(request);
  if (!ctx) {
    return {
      status: 401,
      headers: { "WWW-Authenticate": wwwAuthenticateHeader(request) },
      body: rpcError(id, -32001, "Unauthorized: a valid Muse access token is required."),
    };
  }

  // Rate limit: 120 req/min per grant.
  const limiter = opts.rateLimiter ?? moduleRateLimiter;
  const now = opts.nowMs ? opts.nowMs() : Date.now();
  if (!limiter.check(ctx.grantId, now)) {
    return {
      status: 429,
      headers: { "Retry-After": "60" },
      body: rpcError(id, -32029, "Rate limit exceeded: 120 requests per minute per grant."),
    };
  }

  const adapter =
    opts.createAdapter?.(ctx) ?? createMuseConnectorAdapter();

  switch (method) {
    case "initialize": {
      return {
        status: 200,
        body: rpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        }),
      };
    }
    case "ping": {
      return { status: 200, body: rpcResult(id, {}) };
    }
    case "tools/list": {
      return {
        status: 200,
        body: rpcResult(id, { tools: buildToolsList(adapter) }),
      };
    }
    case "tools/call": {
      return toolsCall(adapter, ctx, id, msg.params);
    }
    default:
      return { status: 200, body: rpcError(id, -32601, `Method not found: ${method}`) };
  }
}

async function toolsCall(
  adapter: MuseConnectorAdapter,
  ctx: MuseGrantContext,
  id: unknown,
  params: unknown
): Promise<McpHandleResult> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return { status: 200, body: rpcError(id, -32602, "Invalid params: tools/call requires { name, arguments }.") };
  }
  const p = params as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name : "";
  const args =
    p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments)
      ? (p.arguments as Record<string, unknown>)
      : null;
  if (!name) {
    return { status: 200, body: rpcError(id, -32602, "Invalid params: tool name is required.") };
  }
  if (args === null) {
    return { status: 200, body: rpcError(id, -32602, "Invalid params: arguments must be an object.") };
  }
  const known = NXTSEND_TOOL_MANIFEST.some((t) => t.name === name);
  if (!known) {
    return { status: 200, body: rpcError(id, -32601, `Unknown tool: ${name}`) };
  }
  const validation = validateToolInput(name, args);
  if (validation) {
    return {
      status: 200,
      body: rpcError(id, -32602, validation.message, { details: validation.details }),
    };
  }

  const result = await adapter.handleToolCall(name, args, {
    subject: ctx.userId,
    scopes: ctx.scopes,
    workspaceId: ctx.workspaceId,
  });

  if (result.status === "not_implemented") {
    return {
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify({ status: "BLOCKED", code: "not_implemented", message: result.reason }) }],
        structuredContent: { status: "BLOCKED", code: "not_implemented", message: result.reason },
        isError: true,
      }),
    };
  }
  if (result.status === "error") {
    const payload = {
      status: result.resultStatus,
      code: result.code,
      message: result.message,
      ...(result.details ? { details: result.details } : {}),
    };
    return {
      status: 200,
      body: rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: true,
      }),
    };
  }
  const data = result.data as Record<string, unknown> | unknown;
  const isObj = data !== null && typeof data === "object" && !Array.isArray(data);
  const outcomeStatus =
    isObj && typeof (data as Record<string, unknown>).status === "string"
      ? (data as Record<string, unknown>).status
      : "SUCCESS";
  return {
    status: 200,
    body: rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: isObj
        ? { ...(data as Record<string, unknown>), status: outcomeStatus }
        : { value: data, status: outcomeStatus },
      isError: false,
    }),
  };
}

/** Route-level helper: parse + size-cap the MCP request body. */
export async function readMcpBody(
  request: Request
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: number; body: unknown }
> {
  const text = await request.text();
  if (text.length > MCP_BODY_LIMIT_BYTES) {
    return {
      ok: false,
      status: 413,
      body: rpcError(null, -32600, "Request body too large (64KB cap)."),
    };
  }
  if (!text.trim()) {
    return {
      ok: false,
      status: 400,
      body: rpcError(null, -32700, "Parse error: empty body."),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      status: 400,
      body: rpcError(null, -32700, "Parse error: body is not valid JSON."),
    };
  }
}

export function jsonResponse(result: McpHandleResult): NextResponse {
  if (result.body === null) {
    return new NextResponse(null, {
      status: result.status,
      headers: result.headers,
    });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
