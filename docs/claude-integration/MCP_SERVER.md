# MCP Server (`/api/mcp/claude`)

## Endpoint

| | |
|---|---|
| URL | `https://nxtsend.com/api/mcp/claude` (production; replace origin with the deployment's public URL) |
| Transport | Streamable HTTP, JSON-RPC 2.0, `POST` only (`GET` → 405) |
| Runtime | Node.js, `force-dynamic` |
| Protocol | MCP `2025-06-18` (see `initialize` response) |
| Shared handler | `handleMcpRequest` in `src/lib/muse-connector/mcp.ts`, flavor `"claude"` — the same code serves `/api/mcp` with flavor `"muse"` and `/api/mcp/chatgpt` with flavor `"chatgpt"` |

The route reads the Claude-aware flag `isClaudeMcpEnabled()`
(`CLAUDE_MCP_ENABLED`, else `MUSE_MCP_ENABLED`, else enabled).
The OAuth routes are **not** gated by this flag, so disabling the MCP
surface can never leave a half-issued grant against a dead server.

## No pre-auth discovery (unlike ChatGPT)

Claude is like Muse here: **every method needs a valid token**.
There is no ChatGPT-style pre-auth discovery — `initialize`,
`tools/list` and `resources/list` without a token all answer 401:

| Situation | Response |
|---|---|
| No/invalid/expired/revoked token, or token bound to another resource (RFC 8707) | **401** + `WWW-Authenticate: Bearer <redacted>"<origin>/.well-known/oauth-protected-resource/api/mcp/claude"` (flavor-aware header and error text: "a valid Claude access token is required"). |
| Demo Mode | **503** `not_configured` — "Claude MCP is not available in Demo Mode. Connect Supabase and configure OAuth to enable it." The server serves no demo data, ever. |
| MCP surface disabled | **503** `not_configured` — "Claude MCP is disabled (CLAUDE_MCP_ENABLED=false)." |
| Grant lacks the tool's scope tier | **HTTP 200 tool result** with `isError: true`, `code: "missing_scope"`, `structuredContent.status: "BLOCKED"` — the Muse-style error, **not** the ChatGPT structured reconnect prompt. The message names the canonical `muse.*` scope for the tier (see PERMISSIONS.md). |
| Rate limit exceeded | **429**, `Retry-After: 60` — 120 requests/min per grant, in-memory limiter (not shared across serverless instances; see SECURITY.md). |
| Request body over 64 KB | **413** ("Request body too large (64KB cap).") |
| Empty body / invalid JSON | **400** (`-32700` Parse error) |
| Malformed JSON-RPC | **400** (`-32600` Invalid Request) |
| Unknown method / unknown tool | JSON-RPC `-32601` Method not found (HTTP 200) |
| Invalid params | JSON-RPC `-32602` (HTTP 200) |

## `initialize`

With a valid token, `initialize` returns:

- `protocolVersion: "2025-06-18"`
- `capabilities: { tools: {}, prompts: {}, resources: {} }` — the only
  flavor that advertises all three (Muse advertises `{tools}` only;
  ChatGPT `{tools, resources}`).
- `serverInfo: { name: "nxtsend-mcp", version: "1.0.0" }`
- `instructions` — Claude-specific server instructions
  (`MCP_CLAUDE_SERVER_INSTRUCTIONS` in `src/lib/muse-connector/mcp.ts`):
  confirm IDs before mutating, LinkedIn sends NOT supported,
  destructive actions need explicit confirmation every time,
  workspace-scoped data, prompts are templates that fetch no data,
  a prompt never sends/merges/deletes, creating a campaign only ever
  creates a draft, a send reports sent only with a provider message
  ID, and "reconnect NxtSend in Claude and grant that permission" on
  a missing scope.

`notifications/initialized` and `notifications/cancelled` are
accepted with no response body (202). `ping` returns `{}`.

## Tool results

Every tool result carries **both** `content` (human-readable text)
and `structuredContent` (machine-readable data). Tool annotations are
served on `tools/list`:

- `readOnlyHint: true` for 35 of 54 tools.
- `destructiveHint: true` exactly for `delete_lead`,
  `delete_campaign`, `send_email`, `send_inbox_reply`.
- `openWorldHint: false` on every tool — all tools are bounded to the
  connected workspace.
- **One deliberate exception:** `get_conversation` is classified Read
  but has `readOnlyHint: false`, because opening a thread marks its
  inbound messages read — a real state change, declared in its
  description and side effects.
- Tool-level `_meta` rides on results: `render_campaigns_widget`
  carries `ui.resourceUri` + `openai/outputTemplate`
  (`ui://widget/campaigns.html`); `get_profile` carries
  `{"openai/profile": true}`.

## Prompts (Claude-only)

`prompts/list` and `prompts/get` exist **only** on the Claude flavor
— a documented decision (`src/lib/muse-connector/prompts.ts`). Muse
and ChatGPT answer both methods with `-32601` Method not found.
Prompts require a valid token, like everything else on this flavor.

| Prompt | Required argument | What it does |
|---|---|---|
| `campaign-performance-summary` | `campaign` (name or id) | Template: tells the model to resolve the name with `search_campaigns`, call `get_campaign_performance`, summarise the real results only. |
| `lead-follow-up-draft` | `leadId` | Template: tells the model to call `get_lead` (+ activity history) and draft a follow-up **for human review** — never send it. |
| `weekly-performance-report` | `dateRange` (label, e.g. "2026-11-09 to 2026-11-15") | Template: tells the model to call `get_performance_summary` + `get_usage_summary` and summarise real results only. |
| `duplicate-lead-cleanup` | — | Template: tells the model to call `detect_duplicate_leads` and list groups for review. Never merges or deletes. |

Prompts are **templates, not data fetches**: a `prompts/get` result
is text only, and a prompt that needs workspace data says so in its
message — it names the tools to call instead of inventing numbers.
No prompt ever triggers a send, a merge or a delete. Argument
validation: a missing/blank required argument, an unknown argument
name, or an unknown prompt name answers `-32602`. Nothing here
touches the network or the database.

## Resources

| Resource | Mime type | Notes |
|---|---|---|
| `ui://widget/campaigns.html` | `text/html;profile=mcp-app` | Campaigns widget (shared with Muse/ChatGPT). `_meta.ui.prefersBorder: true`. Served only to an authenticated caller. |
| `nxtsend://account` | `application/json` | **New for Claude.** The connected account for this grant, resolved from the grant only: `userId`, `workspaceId`, `clientId`, `grantId`, `scopes`, `resource`. Read-only; no secrets and no token values are ever included. **A plan is deliberately NOT included** — the grant does not store one, and inventing one would be fake data. (`get_profile` the tool *does* return the workspace plan; the resource does not.) |

Both resources require a valid token (401 without one). Unknown URIs
answer `-32602` ("Unknown resource: …"). `resources/list` returns
both resources; unlike ChatGPT, it is not available pre-auth.

## The widget

The campaigns widget is the shared widget from the ChatGPT surface
(Apps SDK pattern, verified live from
https://developers.openai.com/apps-sdk/build/custom-ux on 2026-11-16):

- **Decoupled:** data tools return only `structuredContent`;
  `render_campaigns_widget` (Read) only renders — its description says
  "Always call list_campaigns first…".
- **Dual metadata:** `_meta.ui.resourceUri` (shared MCP Apps key) +
  `_meta["openai/outputTemplate"]` (ChatGPT alias), both
  `ui://widget/campaigns.html`.
- **Bridge:** data arrives via the `window.openai` compatibility bridge
  (`toolInput` / `toolOutput`, feature-detected) and a defensive
  postMessage listener for the shared `ui/*` bridge. Plain fallback
  text when no bridge exists.
- **Self-contained:** inline HTML/CSS/JS only, no new dependency, no
  external resources; NxtSend branding; loading / empty / error states;
  responsive; dark-mode aware.
- **UI verification PENDING:** the widget HTML is served and
  unit-tested, but it has never been rendered inside a live Claude
  client. Never claim a live render.

Tools stay useful without the UI: `list_campaigns` /
`get_campaign_performance` return the same data as plain
`structuredContent`.

## Health check

`GET /api/mcp/health` (public, no auth) reports mode, whether the Muse
MCP surface is enabled, the manifest tool count (54), whether OAuth is
configured, protocol version and server version. It is the Muse
surface's flag by design; the Claude route's own flag is
`CLAUDE_MCP_ENABLED` (see `src/app/api/mcp/claude/route.ts`).

## Differences from `/api/mcp` (Muse) and `/api/mcp/chatgpt`

| | `/api/mcp` (Muse) | `/api/mcp/chatgpt` (ChatGPT) | `/api/mcp/claude` (Claude) |
|---|---|---|---|
| `initialize` without token | 401 | 200 (discovery) | 401 |
| `tools/list` without token | 401 | 200, tools annotated `Requires OAuth` | 401 |
| `resources/list` without token | 401 | 200 | 401 |
| `initialize` response | no `instructions` | `instructions` (ChatGPT wording) | `instructions` (Claude wording) |
| `initialize` capabilities | `{tools}` | `{tools, resources}` | `{tools, prompts, resources}` |
| Prompts | `-32601` | `-32601` | `prompts/list` + `prompts/get` (4 prompts) |
| Resources | widget only | widget only | widget + `nxtsend://account` |
| Tool set | 54 tools (same manifest) | 54 tools (same manifest) | 54 tools (same manifest) |
| Scope prefix | `muse.*` | `nxtsend.*` | `claude.*` |
| Resource (RFC 8707) | `https://<origin>/api/mcp` | `https://<origin>/api/mcp/chatgpt` | `https://<origin>/api/mcp/claude` |
| Missing-scope answer | `missing_scope` error | structured reconnect prompt | `missing_scope` error |
| Demo mode | 503 | 503 | 503 |
