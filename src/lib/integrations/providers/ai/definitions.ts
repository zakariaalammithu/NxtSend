/**
 * MCP-client definitions (Stage 6) — Gemini, Cursor, Claude Code.
 *
 * These are MCP *clients*, not servers. The MCP server already
 * exists (`/api/mcp`, `/api/mcp/chatgpt`, `/api/mcp/claude` — 54
 * tools on the ChatGPT/Claude flavours, shared OAuth 2.1 server).
 * These definitions describe how each client connects to it.
 *
 * Endpoint choice: all three generic clients connect to the
 * ChatGPT flavour (`/api/mcp/chatgpt`) with the `nxtsend.*` scopes.
 * No new scope aliases were needed — the shared server's DCR +
 * loopback-redirect rules already accept these clients (see
 * src/lib/muse-connector/oauth/clients.ts: loopback
 * http://localhost:<port> redirect URIs are allowed for every
 * platform, including chatgpt). Cursor's WEB callback
 * (https://www.cursor.com/agents/mcp/oauth/callback) is NOT on the
 * allowlist — Cursor desktop (localhost:8787) works, Cursor web
 * does not; that is documented in the Cursor guide.
 *
 * Exported here — NOT appended to `./registry.ts` (the coordinator
 * merges these in). Nothing here claims a live client test: no
 * Gemini / Cursor / Claude Code client was connected from this
 * environment.
 */

import type { ProviderDefinition } from "../types";

export const AI_MCP_CLIENT_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini (Gemini CLI)",
    category: "ai",
    authType: "oauth2",
    docsUrl: "https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html",
    capabilities: [
      "MCP client: connects Gemini CLI to the existing NxtSend MCP server (Streamable HTTP) at /api/mcp/chatgpt with OAuth 2.1 + DCR — no new server, no new tools",
      "54 tools with per-grant scope enforcement; scopes nxtsend.read / nxtsend.write (request nxtsend.send only when send-capable tools are needed — it is a separate tier)",
      "LinkedIn-send actions are NOT SUPPORTED; the date-range report tool returns 501 (all-time stats only)",
      "Guide only: no live Gemini CLI connection was tested from this environment",
    ],
    twoWaySync: true,
    scopes: ["nxtsend.read", "nxtsend.write"],
  },
  {
    id: "cursor",
    name: "Cursor",
    category: "ai",
    authType: "oauth2",
    docsUrl: null, // No verbatim Cursor MCP docs URL was returned by search; see docs/integrations/providers/mcp-client-cursor.md for the config the guides verify.
    capabilities: [
      "MCP client: connects Cursor to the existing NxtSend MCP server (Streamable HTTP) at /api/mcp/chatgpt with OAuth 2.1 + DCR — no new server, no new tools",
      "54 tools with per-grant scope enforcement; scopes nxtsend.read / nxtsend.write (request nxtsend.send only when send-capable tools are needed — it is a separate tier)",
      "LinkedIn-send actions are NOT SUPPORTED; the date-range report tool returns 501 (all-time stats only)",
      "Cursor desktop works (loopback redirect http://localhost:8787/callback is allowlisted); Cursor web does NOT — its callback https://www.cursor.com/agents/mcp/oauth/callback is not on the server's allowlist",
      "Guide only: no live Cursor connection was tested from this environment",
    ],
    twoWaySync: true,
    scopes: ["nxtsend.read", "nxtsend.write"],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    category: "ai",
    authType: "oauth2",
    docsUrl: "https://code.claude.com/docs/en/mcp",
    capabilities: [
      "MCP client: connects Claude Code to the existing NxtSend MCP server (Streamable HTTP) at /api/mcp/chatgpt with OAuth 2.1 + DCR — no new server, no new tools. (This is the CLI client; the claude.ai /api/mcp/claude flavour is a separate, already-built server.)",
      "54 tools with per-grant scope enforcement; scopes nxtsend.read / nxtsend.write (request nxtsend.send only when send-capable tools are needed — it is a separate tier)",
      "LinkedIn-send actions are NOT SUPPORTED; the date-range report tool returns 501 (all-time stats only)",
      "Guide only: no live Claude Code connection was tested from this environment",
    ],
    twoWaySync: true,
    scopes: ["nxtsend.read", "nxtsend.write"],
  },
];
