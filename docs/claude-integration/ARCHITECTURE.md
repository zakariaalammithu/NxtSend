# Architecture

## Direction: NxtSend is the server

Claude calls **into** NxtSend. There is no "Claude client" in this
codebase and no outbound call to Anthropic for the connection itself:

1. Claude discovers the MCP resource via RFC 9728 protected-resource
   metadata (`/.well-known/oauth-protected-resource/api/mcp/claude`,
   or the root document with `?resource=`).
2. Claude discovers the authorization server via RFC 8414 metadata
   (`/.well-known/oauth-authorization-server`), which advertises
   `client_id_metadata_document_supported: true` — so Claude selects
   CIMD when that flag is present **and** `none` is among the token
   auth methods; otherwise it falls back to DCR.
3. Claude identifies itself with a CIMD `client_id` URL or registers
   via DCR (`POST /api/muse/oauth/register`), then starts the OAuth
   authorization-code + PKCE (S256 only) flow against NxtSend's
   consent screen.
4. After the user approves, Claude exchanges the code for an access
   token (1 h) + refresh token (60 d), both bound by RFC 8707 to the
   Claude MCP resource (`https://<origin>/api/mcp/claude`).
5. Claude calls the MCP server at `/api/mcp/claude` (Streamable HTTP,
   JSON-RPC 2.0, protocol `2025-06-18`) with
   `Authorization: Bearer <access token>`. Every call is resolved
   against the grant: one user, one workspace, one resource, the
   granted `claude.*` scopes.

The existing AI providers (OpenAI / Anthropic / Meta) are reused only
inside `draft_outreach_message` — they draft text; they are not the
connection. `ANTHROPIC_API_KEY` is **not** required for Claude to
connect.

## Shared core, three flavors

One OAuth server, one tool manifest, one MCP handler serve all three
platforms. The Claude work adds a third flavor to the existing two:

| | Muse (`/api/mcp`) | ChatGPT (`/api/mcp/chatgpt`) | Claude (`/api/mcp/claude`) |
|---|---|---|---|
| Scope prefix | `muse.*` | `nxtsend.*` | `claude.*` |
| Resource (RFC 8707) | `https://<origin>/api/mcp` | `https://<origin>/api/mcp/chatgpt` | `https://<origin>/api/mcp/claude` |
| Redirect URI | `https://agent.meta.ai/api/hatch/oauth/callback` | `https://chatgpt.com/connector_platform_oauth_redirect` | `https://claude.ai/api/mcp/auth_callback` (+ `https://claude.com/api/mcp/auth_callback` — see caveat in README.md) |
| Pre-auth discovery | none — every method needs a token | `initialize`, `tools/list`, `resources/list` without a token | none — every method needs a token |
| `initialize` | no `instructions` | `instructions` (ChatGPT wording) | `instructions` (Claude wording) + `capabilities: {tools, prompts, resources}` |
| Prompts | method not found (`-32601`) | method not found (`-32601`) | `prompts/list` + `prompts/get` (4 prompts) |
| Resources | widget only | widget only | widget + `nxtsend://account` |
| Missing-scope answer | Muse-style `missing_scope` error | structured reconnect prompt | Muse-style `missing_scope` error |
| Tool set | 54 tools (same manifest) | 54 tools (same manifest) | 54 tools (same manifest) |

The flavor is a parameter to the shared handler
(`handleMcpRequest(..., flavor)` in `src/lib/muse-connector/mcp.ts`);
the route files are thin (`src/app/api/mcp/claude/route.ts` parses the
body, reads `isClaudeMcpEnabled()`, hands off). No platform's
behaviour changed to add Claude: the Muse and ChatGPT flavors keep
their exact prior behaviour (verified by their unchanged test suites).

## Module map

| Module | Role for Claude |
|---|---|
| `src/app/api/mcp/claude/route.ts` | `POST` only (`GET` → 405). Reads the Claude flag, calls the shared handler with `flavor: "claude"`. |
| `src/lib/muse-connector/mcp.ts` | Shared handler. Flavor switch: auth (every method needs a token for Claude), Claude `initialize` (instructions + `{tools, prompts, resources}` capabilities), `prompts/list` + `prompts/get` (Claude only), `resources/list` + `resources/read` (widget + `nxtsend://account`), 120 req/min per-grant in-memory rate limit, demo mode → 503. |
| `src/lib/muse-connector/prompts.ts` | The 4 Claude-only prompts (templates, text-only, validated args). |
| `src/lib/muse-connector/manifest.ts` | The 54-tool manifest (shared, unchanged for Claude). |
| `src/lib/muse-connector/schemas.ts` | Per-tool input schemas + required scope (canonical `muse.*` names) + tier map. |
| `src/lib/muse-connector/adapter.ts` | Tool implementations; scope-tier enforcement via `grantHasTier` (prefix-agnostic). |
| `src/lib/muse-connector/oauth/` | The shared OAuth 2.1 server: `authorize.ts` (platform-bound redirect + resource validation), `clients.ts` (redirect allowlist incl. both Claude callbacks, DCR), `cimd.ts` (CIMD fetch/validate/cache, Claude Code host detection), `scopes.ts` (`claude.*` scopes + tier map), `config.ts` (`isClaudeMcpEnabled` / `getClaudePublicUrl` precedence), `tokens.ts` (hashing, rotation, reuse-revokes-grant), `state.ts` (HMAC authorize state), `store.ts` (Supabase store). |
| `src/lib/muse-connector/grants.ts` | Grant origin classification — Claude by CIMD host (`claude.ai` / `claude.com`), Claude redirect URI, or `claude.*` scope fallback; `GrantsByOrigin` now Muse / ChatGPT / Claude / Other / Total. |
| `src/app/.well-known/oauth-protected-resource/api/mcp/claude/route.ts` | RFC 9728 metadata for the Claude resource. Root route accepts `?resource=` for the Claude resource. |
| `src/app/.well-known/oauth-authorization-server/route.ts` | RFC 8414 metadata; now advertises `client_id_metadata_document_supported: true`. |
| `src/app/api/muse/oauth/*` | Shared authorize / token / revoke / register routes (platform-agnostic). |
| `src/app/api/muse/grants/` + `src/app/api/muse/activity` | Platform-agnostic grants/activity APIs; the UI filters by platform. |
| `src/lib/integrations-center/` | `registry.ts` (`claude` entry, kind `adapter`), `status.ts` (`claudeGrantsActive` + status branch), `verify.ts` (`claude` verify case — no outbound call, never "Verified" without a grant). |
| `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx` | `ConnectorLivePanels` generalised to `muse` | `chatgpt` | `claude`; `ClaudeLivePanels` with Claude endpoints, scopes, connect steps, grants, activity, 54-tool manifest, security notes. |
| `src/app/api/integrations/status/route.ts` | Passes `claudeGrantsActive` (by-origin, workspace-filtered). |
| `src/app/api/admin/muse/route.ts` + `src/app/(admin)/admin/integrations/muse-ai/page.tsx` | Admin MCP overview: `grantsByOrigin` now includes `claude`; Claude surface flags + public URL. |
| `src/lib/admin/platform-server.ts` | `getSystemHealth()` adds a `claude-mcp` check. |
| `supabase/migrations/023_muse_oauth.sql` + `024_chatgpt_oauth_resource.sql` | Reused as-is — no new migration, no new tables (see DATABASE.md). |

## Request flows

### OAuth grant (Claude)

```
Claude ──► GET /.well-known/oauth-protected-resource/api/mcp/claude
        (resource, authorization_servers, scopes_supported)
Claude ──► GET /.well-known/oauth-authorization-server
        (issuer, endpoints, S256 only, auth methods ["none",
         "client_secret_post"], client_id_metadata_document_supported: true)
Claude ──► POST /api/muse/oauth/register   (DCR; or CIMD client_id URL)
Claude ──► GET  /api/muse/oauth/authorize?client_id=…&redirect_uri=https://claude.ai/api/mcp/auth_callback
             &code_challenge=…&code_challenge_method=S256&scope=claude.read&resource=https://<origin>/api/mcp/claude
User   ──► consent screen (client name + origin + platform + redirect
             hostname + plain-words scopes) ──► approve
Claude ◄── code (10 min, single-use, resource-bound, HMAC state checked)
Claude ──► POST /api/muse/oauth/token  {grant_type: authorization_code, code, code_verifier}
Claude ◄── access token (1 h) + refresh token (60 d), RFC 9207 iss
Claude ──► POST /api/mcp/claude  (Bearer token, resource-bound)
```

### MCP tool call

```
Claude ──► POST /api/mcp/claude  {jsonrpc: "2.0", method: "tools/call",
             params: {name, arguments}}
  ├─ demo mode? → 503 not_configured ("Claude MCP is not available in Demo Mode…")
  ├─ MCP disabled? → 503 not_configured (CLAUDE_MCP_ENABLED=false)
  ├─ body > 64 KB / bad JSON → 413 / 400 (-32700 / -32600)
  ├─ no/invalid/expired/revoked token, or token bound to another
  │   resource → 401 + WWW-Authenticate naming
  │   /.well-known/oauth-protected-resource/api/mcp/claude
  │   (the error text still says "a valid Muse access token is
  │   required" — see the discrepancy note in the final report)
  ├─ > 120 req/min for this grant → 429, Retry-After: 60
  ├─ unknown tool → -32601; bad args → -32602
  ├─ grant lacks the tool's tier → HTTP 200 tool result, isError: true,
  │   code: "missing_scope", message naming the canonical muse.* scope
  │   for the tier (e.g. "This tool requires the muse.write scope…") —
  │   the tier check itself is prefix-agnostic, so a claude.write
  │   grant satisfies it
  └─ otherwise → adapter runs the tool workspace-scoped; result carries
      content (text) + structuredContent; audit row muse.tool.<name>
```

### Prompts and resources

```
prompts/list, prompts/get ──► Claude flavor only; token required.
  get validates name + args (unknown prompt, missing/blank required
  arg, unknown arg → -32602). Renders a text-only template message
  naming the tools to call. Never touches the network or the DB.
resources/list, resources/read ──► token required. Widget
  (ui://widget/campaigns.html) + nxtsend://account (grant-derived
  JSON: userId, workspaceId, clientId, grantId, scopes, resource —
  no secrets, no token values, no plan).
```

## Demo Mode

The whole surface refuses in demo mode (503 `not_configured`) before
any auth check — the demo persona is never served to Claude, and no
demo data ever leaks through a tool, a prompt or a resource.

## Stateless / Vercel shape

Stateless Streamable HTTP: no server-side session, no sticky state.
The only in-process state is the rate limiter (per-instance,
best-effort — see SECURITY.md) and the CIMD document cache (~5 min,
in-memory). Every tool is a bounded store lookup, sized for the
Vercel Hobby 10 s limit. See VERCEL_DEPLOYMENT.md.
