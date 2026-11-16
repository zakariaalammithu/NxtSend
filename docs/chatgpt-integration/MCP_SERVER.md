# MCP Server (`/api/mcp/chatgpt`)

## Endpoint

| | |
|---|---|
| URL | `https://nxtsend.com/api/mcp/chatgpt` (production; replace origin with the deployment's public URL) |
| Transport | Streamable HTTP, JSON-RPC 2.0, `POST` only (`GET` → 405) |
| Runtime | Node.js, `force-dynamic` |
| Protocol | MCP `2025-06-18` (see `initialize` response) |
| Shared handler | `handleMcpRequest` in `src/lib/muse-connector/mcp.ts`, flavor `"chatgpt"` — the same code serves `/api/mcp` with flavor `"muse"` |

The route reads the ChatGPT-aware flag `isChatGptMcpEnabled()`
(`CHATGPT_MCP_ENABLED`, else `MUSE_MCP_ENABLED`, else enabled).
The OAuth routes are **not** gated by this flag, so disabling the MCP
surface can never leave a half-issued grant against a dead server.

## What works without a token (discovery only)

ChatGPT needs to see the server before it has a token, so three methods
answer **without authentication** — but they return static metadata only,
never data:

| Method | Response |
|---|---|
| `initialize` | `protocolVersion`, `capabilities: {tools, resources}`, `serverInfo`, plus `instructions`. The first 512 chars of `instructions` carry: confirm IDs before mutating, LinkedIn sends NOT supported, destructive actions need explicit confirmation, workspace-scoped data. |
| `tools/list` | All 54 tools, each with its description suffixed `Requires OAuth: connect your NxtSend account before calling this tool — it returns no data until you do.` and `_meta.requiresOAuth: true`. No data. |
| `resources/list` | The campaigns widget resource `ui://widget/campaigns.html` (`text/html;profile=mcp-app`). |

## What requires a token

Everything else — `tools/call`, `resources/read`, and `initialize` in
live mode after discovery — requires a valid access token:

| Situation | Response |
|---|---|
| No/invalid/expired/revoked token | **401** + `WWW-Authenticate` header carrying `resource_metadata` (RFC 9728 discovery URL) |
| Token bound to the wrong resource (RFC 8707) | 401 — a token issued for `/api/mcp` does not validate for `/api/mcp/chatgpt`, and vice versa |
| Demo Mode | **503** `not_configured` — the server serves no demo data, ever |
| MCP surface disabled | **503** `not_configured` |
| Grant lacks the tool's scope tier | **HTTP 200 tool result** with `isError: true`, `code: "missing_scope"`, `reconnect: true` and a plain-words reconnect prompt (a normal tool result, not a transport error, so ChatGPT can tell the user to reconnect and grant the missing scope) |
| Rate limit exceeded | **429**, `Retry-After: 60` — 120 requests/min per grant, in-memory limiter (not shared across serverless instances; see SECURITY.md) |
| Unknown method | JSON-RPC `-32601` Method not found (HTTP 200) |
| Malformed JSON-RPC | `-32600` Invalid Request (HTTP 400) |

## Tool results

Every tool result carries **both** `content` (human-readable text) and
`structuredContent` (machine-readable data). Tool annotations are served
on `tools/list`:

- `readOnlyHint: true` only for state-free tools (35 of 54).
- `destructiveHint: true` exactly for `delete_lead`, `delete_campaign`,
  `send_email`, `send_inbox_reply`.
- `openWorldHint: false` on every tool — all tools are bounded to the
  connected workspace.
- **One deliberate exception:** `get_conversation` is classified Read but
  has `readOnlyHint: false`, because opening a thread marks its inbound
  messages read — a real state change, declared in its description and
  side effects.

## Resources

| Resource | Mime type | Notes |
|---|---|---|
| `ui://widget/campaigns.html` | `text/html;profile=mcp-app` | Campaigns widget (Apps SDK UI). `_meta.ui.prefersBorder: true`. Served only to an authenticated caller (`resources/read` requires a token). |

## The widget (Apps SDK UI)

Pattern verified live from
https://developers.openai.com/apps-sdk/build/custom-ux (2026-11-16):

- **Decoupled:** data tools return only `structuredContent`;
  `render_campaigns_widget` (Read) only renders — its description says
  "Always call list_campaigns first…".
- **Dual metadata:** `_meta.ui.resourceUri` (shared MCP Apps key) +
  `_meta["openai/outputTemplate"]` (ChatGPT alias), both
  `ui://widget/campaigns.html`.
- **Bridge:** data arrives via the `window.openai` compatibility bridge
  (`toolInput` / `toolOutput`, feature-detected) and a defensive
  postMessage listener for the shared `ui/*` bridge
  (`ui/notifications/tool-result` / `tool-input`). Plain fallback text
  when no bridge exists.
- **Self-contained:** inline HTML/CSS/JS only, no new dependency, no
  external resources; NxtSend branding; loading / empty / error states;
  responsive; dark-mode aware.
- **UI verification PENDING:** the widget HTML is served and unit-tested
  (resource list/read, mime type, bridge fallback), but it has never been
  rendered inside a live ChatGPT client. Never claim a live render.

Tools stay useful without the UI: `list_campaigns` /
`get_campaign_performance` return the same data as plain
`structuredContent`.

## Health check

`GET /api/mcp/health` (public, no auth) reports mode, whether the Muse
MCP surface is enabled, the manifest tool count (54), whether OAuth is
configured, protocol version and server version. It is the Muse surface's
flag by design; the ChatGPT route's own flag is
`CHATGPT_MCP_ENABLED` (see `src/app/api/mcp/chatgpt/route.ts`).

## Differences from `/api/mcp` (Muse)

| | `/api/mcp` (Muse) | `/api/mcp/chatgpt` (ChatGPT) |
|---|---|---|
| `initialize` without token | 401 | 200 (discovery) |
| `tools/list` without token | 401 | 200, tools annotated `Requires OAuth` |
| `resources/list` without token | 401 | 200 |
| `initialize` response | no `instructions` | `instructions` included |
| Tool set | 54 tools (same manifest) | 54 tools (same manifest) |
| Scope prefix | `muse.*` | `nxtsend.*` |
| Resource (RFC 8707) | `https://<origin>/api/mcp` | `https://<origin>/api/mcp/chatgpt` |
| Missing-scope answer | plain `missing_scope` error (HTTP 200 tool result, `isError: true`, no reconnect prompt) | structured reconnect prompt (`isError: true`, `code: "missing_scope"`, `reconnect: true`, plain-words prompt) |
| Demo mode | 503 | 503 |
