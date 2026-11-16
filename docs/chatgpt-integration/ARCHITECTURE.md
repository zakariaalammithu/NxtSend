# Architecture

## The inverted direction

Most NxtSend integrations call *out* to a provider (Resend, Stripe, Gmail).
The ChatGPT integration runs the other way: **ChatGPT calls into NxtSend**.

```
ChatGPT (chatgpt.com)
   │  OAuth 2.1 (authorization code + PKCE S256)
   │  CIMD client_id URL  or  Dynamic Client Registration
   ▼
NxtSend (https://nxtsend.com)
   ├─ OAuth server        src/lib/muse-connector/oauth/
   │    authorize / token / revoke / register
   │    /.well-known/oauth-authorization-server
   │    /.well-known/oauth-protected-resource (root + per-resource)
   ├─ MCP server          src/app/api/mcp/chatgpt/route.ts
   │    Streamable HTTP, JSON-RPC 2.0, flavor "chatgpt"
   │    54 tools (manifest) + resources (campaigns widget)
   ├─ Tool adapter        src/lib/muse-connector/adapter.ts
   │    workspace-scoped reads/writes against the real product stores
   ├─ Widget              src/lib/muse-connector/widget.ts
   │    ui://widget/campaigns.html (Apps SDK UI, inline HTML/CSS/JS)
   └─ Supabase            migrations 023 + 024
        muse_oauth_clients / muse_oauth_codes / muse_oauth_tokens
        (RLS enabled, zero policies — service role only)
```

The Muse connector (`/api/mcp`, `muse.*` scopes) shares the OAuth server,
the adapter, the grant machinery and the tables. The two surfaces differ
in exactly four places: the MCP path, the scope prefix, the RFC 8707
resource URL, and the redirect URI. Nothing else is forked.

## Request flows

### 1. Connect (first time)

1. Owner enables Developer Mode in ChatGPT and adds the MCP URL
   `https://nxtsend.com/api/mcp/chatgpt`.
2. ChatGPT discovers the server: `initialize` / `tools/list` /
   `resources/list` answer **without a token** (static metadata only;
   every tool is annotated `Requires OAuth`, `_meta.requiresOAuth: true`).
3. ChatGPT fetches the root protected-resource metadata
   (`/.well-known/oauth-protected-resource`) and the authorization-server
   metadata (`/.well-known/oauth-authorization-server`), then starts the
   OAuth flow.
4. ChatGPT identifies itself either with a **CIMD** `client_id` (an https
   URL whose document NxtSend fetches and validates, 5 s timeout, 64 KB
   cap, ~5 min in-memory cache, never persisted) or via **DCR**
   (`POST /api/muse/oauth/register`, public client, no secret).
5. The user signs in on NxtSend's consent screen (client name + origin +
   platform shown), picks scopes (`nxtsend.read` is the recommended
   default), and approves. The authorization code is single-use, 10 min,
   PKCE-verified (S256 only).
6. ChatGPT exchanges the code for an access token (1 h) + refresh token
   (60 d, rotating, reuse revokes the whole grant). Tokens are stored
   as SHA-256 hashes only.

### 2. Tool call (steady state)

1. ChatGPT POSTs a JSON-RPC `tools/call` to `/api/mcp/chatgpt` with a
   Bearer token.
2. `handleMcpRequest` (flavor `chatgpt`, shared with `/api/mcp`)
   validates the token, checks the token's RFC 8707 `resource` matches
   `https://<origin>/api/mcp/chatgpt`, enforces the per-grant scope tier
   for the tool, and rate-limits (120 req/min per grant, in-memory).
3. The adapter executes against the workspace-scoped stores and returns
   `content` + `structuredContent` (both, on every tool result).
4. Every call is audit-logged (best-effort) as `muse.tool.<name>` with
   grant id and outcome — the same audit stream as the Muse connector,
   which is why the ChatGPT detail page notes the activity log is shared.

### 3. Widget render

Data and rendering are **decoupled** (the Apps SDK pattern verified live
from https://developers.openai.com/apps-sdk/build/custom-ux on
2026-11-16):

1. ChatGPT calls `list_campaigns` (a normal Read tool) and gets
   `structuredContent`.
2. ChatGPT calls `render_campaigns_widget` with those campaign summaries.
   The tool returns no data of its own — it carries
   `_meta.ui.resourceUri: ui://widget/campaigns.html` and
   `_meta["openai/outputTemplate"]` with the same URI.
3. ChatGPT fetches the resource (`resources/read`, token required) and
   renders the inline HTML. Data arrives through the `window.openai`
   bridge (`toolInput` / `toolOutput`, feature-detected) or the shared
   `ui/*` postMessage bridge; without a bridge the widget shows a plain
   fallback message, never a blank frame.

UI verification is **PENDING**: the widget is served and unit-tested but
has never been rendered inside a live ChatGPT client.

## Module map

| Area | Files |
|---|---|
| OAuth server | `src/lib/muse-connector/oauth/` — `config.ts` (flags/URLs/platforms), `scopes.ts`, `cimd.ts`, `clients.ts`, `authorize.ts`, `handlers.ts`, `tokens.ts`, `store.ts`, `state.ts`, `context.ts`, `index.ts` |
| OAuth routes | `src/app/api/muse/oauth/{authorize,token,revoke,register}/route.ts`, `src/app/.well-known/oauth-authorization-server/route.ts`, `src/app/.well-known/oauth-protected-resource/route.ts` (+ `/api/mcp` and `/api/mcp/chatgpt` variants) |
| MCP server | `src/app/api/mcp/chatgpt/route.ts`, `src/lib/muse-connector/mcp.ts` (`handleMcpRequest`, flavor `muse \| chatgpt`), `src/app/api/mcp/health/route.ts` |
| Tools | `src/lib/muse-connector/manifest.ts` (54-tool manifest + annotations), `src/lib/muse-connector/adapter.ts` (implementations), `src/lib/muse-connector/schemas.ts` |
| Widget | `src/lib/muse-connector/widget.ts` |
| Grants | `src/lib/muse-connector/grants.ts` (`listMuseGrants`, `countActiveMuseGrants`, `countActiveGrantsByOrigin`) |
| Settings UI | `src/lib/integrations-center/{registry,status,verify}.ts`, `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx`, `src/app/api/integrations/status/route.ts`, `src/app/api/muse/{grants,activity}/route.ts` |
| Admin | `src/app/(admin)/admin/integrations/muse-ai/page.tsx`, `src/app/api/admin/muse/route.ts`, `getSystemHealth()` in `src/lib/admin/platform-server.ts` |
| Config | `.env.example`, `src/lib/config-status.ts`, `scripts/check-config.mjs` |
| Database | `supabase/migrations/023_muse_oauth.sql`, `024_chatgpt_oauth_resource.sql` |

## Design constraints (deliberate)

- **Stateless server, Vercel Hobby-safe.** No websockets, no long-lived
  connections; the MCP server is plain request/response. The 10 s Hobby
  function limit is respected because every tool is a bounded store
  lookup, not a long job.
- **In-memory rate limiting.** One limiter instance per serverless
  instance (120 req/min per grant). It is not shared across instances —
  documented as a limitation in SECURITY.md, not hidden.
- **No persistent idempotency ledger.** Retried `create_campaign` /
  `create_sequence_step` would create a second row. Replay-dedupe exists
  only where the product already has a dedupe store (sends via message
  `idempotency_key`, `create_lead` via email, enrollments via the
  existing-enrollment skip). See MCP_TOOLS.md / SECURITY.md.
- **No LinkedIn-send tools.** By design, not by omission — see README.md.
- **`get_date_range_report` is honestly BLOCKED.** The stats loaders have
  no date filter, so the tool returns a structured 501-style
  `date_range_not_supported` result instead of inventing numbers.
- **Demo Mode refuses everything.** The OAuth + MCP surfaces return
  503/400 in demo mode; the demo persona is never served to ChatGPT.
