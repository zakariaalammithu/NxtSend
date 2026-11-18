/**
 * Provider registry — the definitions provider workers register
 * against.
 *
 * Starts with the already-live platforms only (zapier, n8n, muse,
 * chatgpt, claude). Provider workers APPEND their own definition
 * here; they do not edit `src/lib/integrations-center/registry.ts`
 * — the coordinator merges these definitions into it later.
 *
 * Capabilities are honest: anything not yet published, submitted
 * or live-verified says so in the capability text itself. Nothing
 * here claims a connection — a definition is a description of what
 * the platform surface offers, not proof that it is connected.
 */

import type { ProviderCategory, ProviderDefinition } from "./types";

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "zapier",
    name: "Zapier",
    category: "automation",
    authType: "oauth2",
    docsUrl: "https://platform.zapier.com/",
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "REST Hook webhooks: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "Zapier Platform CLI app: 5 polling triggers, 8 instant triggers, 12 actions, 5 searches — implemented, NOT published on Zapier",
      "Scopes zapier.read / zapier.write only — there is no zapier.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["zapier.read", "zapier.write"],
  },
  {
    id: "n8n",
    name: "n8n",
    category: "automation",
    authType: "oauth2",
    docsUrl: null,
    capabilities: [
      "OAuth 2.0 (shared server) + REST API v1: leads, campaigns, sequences, conversations, accounts, usage",
      "Scoped API keys (n8n.read / n8n.write, expirable, revocable, shown once) as an alternative to OAuth",
      "Webhook triggers: 8 events with per-subscription HMAC signing, best-effort immediate delivery + cron retries",
      "Community node n8n-nodes-nxtsend v0.1.0 — NOT published on npm, NOT verified by n8n",
      "Scopes n8n.read / n8n.write only — there is no n8n.send tier; LinkedIn-send actions are not supported",
    ],
    twoWaySync: true,
    scopes: ["n8n.read", "n8n.write"],
  },
  {
    id: "muse",
    name: "Muse.ai (Meta Muse)",
    category: "ai",
    authType: "oauth2",
    docsUrl: "https://muse.ai/platform/docs",
    capabilities: [
      "OAuth 2.1 server: authorization code + PKCE (S256 only), refresh-token rotation with reuse detection, RFC 7009 revocation, RFC 7591 Dynamic Client Registration",
      "Hosted MCP server (Streamable HTTP, JSON-RPC 2.0): 18 tools with per-grant scope enforcement — implemented, NOT submitted to Meta",
      "Per-user grant management: list and revoke Muse grants (never exposes token values)",
      "Scopes muse.read / muse.write / muse.send — send is a separate tier and never implied by write",
    ],
    twoWaySync: true,
    scopes: ["muse.read", "muse.write", "muse.send"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT (OpenAI)",
    category: "ai",
    authType: "oauth2",
    docsUrl: "https://developers.openai.com/apps-sdk",
    capabilities: [
      "OAuth 2.1 server: authorization code + PKCE (S256 only), refresh-token rotation with reuse detection, RFC 7591 Dynamic Client Registration, CIMD client documents",
      "Hosted MCP server (Streamable HTTP, JSON-RPC 2.0): 54 tools at /api/mcp/chatgpt with per-grant scope enforcement — implemented, NOT submitted to OpenAI",
      "Per-user grant management: list and revoke ChatGPT grants (never exposes token values)",
      "Scopes nxtsend.read / nxtsend.write / nxtsend.send — send is a separate tier and never implied by write",
    ],
    twoWaySync: true,
    scopes: ["nxtsend.read", "nxtsend.write", "nxtsend.send"],
  },
  {
    id: "claude",
    name: "Claude.ai (Anthropic)",
    category: "ai",
    authType: "oauth2",
    docsUrl: null,
    capabilities: [
      "OAuth 2.1 server: authorization code + PKCE (S256 only), refresh-token rotation with reuse detection, RFC 7009 revocation, RFC 7591 Dynamic Client Registration, CIMD client documents",
      "Hosted MCP server (Streamable HTTP, JSON-RPC 2.0): 54 tools at /api/mcp/claude with per-grant scope enforcement — implemented, NOT submitted to Anthropic",
      "Per-user grant management: list and revoke Claude grants (never exposes token values)",
      "Scopes claude.read / claude.write / claude.send — send is a separate tier and never implied by write",
    ],
    twoWaySync: true,
    scopes: ["claude.read", "claude.write", "claude.send"],
  },
];

export function getProviderDefinition(id: string): ProviderDefinition | null {
  return PROVIDER_DEFINITIONS.find((d) => d.id === id) ?? null;
}

export function listProvidersByCategory(category: ProviderCategory): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter((d) => d.category === category);
}
