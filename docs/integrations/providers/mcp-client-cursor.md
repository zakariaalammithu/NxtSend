# Cursor — connect to NxtSend as an MCP client

> Status: **config-ready guide, not live-tested.** No Cursor client has
> been run against the NxtSend MCP server from this environment. The
> endpoint, OAuth URLs and scopes below are verified from the server code
> (`src/lib/muse-connector/mcp.ts`, `src/lib/muse-connector/oauth/config.ts`,
> `src/lib/muse-connector/oauth/clients.ts`); the connection steps are
> verified from Cursor's MCP documentation.

## What this is

Cursor is an MCP **client** — it connects to NxtSend's existing MCP
server and can call its tools. This guide does **not** build a new MCP
server and adds no new tools. NxtSend already exposes its MCP server at:

| Flavour | URL |
|---|---|
| Generic / ChatGPT (use this one for Cursor) | `https://<your-nxtsend-origin>/api/mcp/chatgpt` |
| Muse | `https://<your-nxtsend-origin>/api/mcp` |
| Claude | `https://<your-nxtsend-origin>/api/mcp/claude` |

Replace `<your-nxtsend-origin>` with your deployment origin, e.g.
`https://nxtsend.com`. Use the `/api/mcp/chatgpt` flavour for Cursor: it is
the generic MCP endpoint and its OAuth platform is `chatgpt`, which is the
platform the shared OAuth 2.1 server maps the `nxtsend.*` scopes to.

## OAuth flow (shared server)

The NxtSend MCP server uses the shared OAuth 2.1 server (PKCE S256,
dynamic client registration, refresh-token rotation).

1. **Discovery.** On the first request the server answers `401` with a
   `WWW-Authenticate` header naming the protected-resource metadata:
   `https://<origin>/.well-known/oauth-protected-resource/api/mcp/chatgpt`
   (the root document is at
   `https://<origin>/.well-known/oauth-protected-resource`).
   The authorization-server metadata is at
   `https://<origin>/.well-known/oauth-authorization-server`.
2. **Dynamic client registration (DCR).** Cursor registers by default at
   `https://<origin>/api/muse/oauth/register`. No pre-registered client
   id is needed.
3. **Authorization.** Browser sign-in at
   `https://<origin>/api/muse/oauth/authorize` (user signs in to NxtSend
   and approves the scopes).
4. **Token exchange.** `https://<origin>/api/muse/oauth/token` (PKCE
   `code_verifier` required). Refresh tokens rotate on use.
5. **Revocation.** `https://<origin>/api/muse/oauth/revoke`.

**Redirect URIs.** Cursor desktop uses a loopback callback
(`http://localhost:8787/callback`). Loopback redirects
(`http://localhost:<port>` and `http://127.0.0.1:<port>`) are allowed for
**every** platform, including `chatgpt` — Cursor desktop works without
any allowlist change.

> **Cursor web does NOT work with this server.** Cursor's web callback
> (`https://www.cursor.com/agents/mcp/oauth/callback`) is **not** on the
> NxtSend OAuth allowlist, and adding it would be a server change outside
> this guide's scope. Use Cursor desktop.

**Scopes.** Reuse the existing `nxtsend.*` scopes — no new scope alias is
needed for Cursor:

| Scope | Grants |
|---|---|
| `nxtsend.read` | Read leads, campaigns, inbox, stats |
| `nxtsend.write` | Create/update leads and campaigns |
| `nxtsend.send` | Send-capable tools (separate tier — request it only if you need the send tools) |

## Step-by-step connection

Add the server to Cursor's MCP config — global
(`~/.cursor/mcp.json`) or project (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "nxtsend": {
      "url": "https://<your-nxtsend-origin>/api/mcp/chatgpt"
    }
  }
}
```

Then:

1. Open Cursor → **Settings → MCP** (or the MCP panel) and confirm the
   `nxtsend` server appears.
2. Click **Authenticate** (or the connect button) next to the server.
   Cursor opens the browser sign-in at
   `https://<origin>/api/muse/oauth/authorize`; sign in to NxtSend and
   approve the requested scopes.
3. Cursor completes DCR + PKCE token exchange automatically and stores
   the tokens. The server should show as connected with its tools listed.

If your setup needs a static client instead of DCR, Cursor supports a
static OAuth `auth` object (`CLIENT_ID`, `CLIENT_SECRET`, `AUTHORIZE_URL`,
`TOKEN_URL`, `SCOPES`) — but NxtSend's DCR endpoint makes that
unnecessary; prefer DCR.

## What Cursor can do once connected

- **54 tools** (verified count in `src/lib/muse-connector/manifest.ts`):
  lead search and management, campaign create/list, inbox replies and
  drafts, campaign stats (all-time only), and more.
- `initialize`, `tools/list` and `resources/list` work without a token;
  tool calls and `resources/read` require a valid OAuth token.

## What it CANNOT do

- **LinkedIn send/accept is NOT SUPPORTED** on any platform — there is
  no tool for sending LinkedIn connection requests or messages, and no
  MCP client can add one.
- **Date-range reports return 501** (`get_date_range_report` is blocked
  by design). Campaign stats are all-time only.
- No persistent idempotency ledger: a retried `create_campaign` call
  may create a duplicate campaign.

## Troubleshooting

- `401` with no sign-in prompt: check the server is reachable at
  `https://<origin>/api/mcp/chatgpt` and that the
  `/.well-known/oauth-protected-resource/api/mcp/chatgpt` document loads.
- "Invalid redirect URI" from the web callback: you are using Cursor
  **web** — switch to Cursor **desktop** (loopback callback), which is
  allowlisted.
- "Insufficient scope" on a tool call: re-authenticate with the scope
  that tool needs (`.read` for reads, `.write` for creates/updates,
  `.send` for send-capable tools).
- Stale tokens: Cursor refreshes automatically; if refresh fails, remove
  the server from Cursor's MCP settings and re-add it to re-run DCR.
