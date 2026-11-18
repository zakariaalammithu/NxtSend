# Google Gemini — connect to NxtSend as an MCP client

> Status: **config-ready guide, not live-tested.** No Gemini CLI client has
> been run against the NxtSend MCP server from this environment. The
> endpoint, OAuth URLs and scopes below are verified from the server code
> (`src/lib/muse-connector/mcp.ts`, `src/lib/muse-connector/oauth/config.ts`,
> `src/lib/muse-connector/oauth/clients.ts`); the connection steps are
> verified from Google's Gemini CLI documentation.

## What this is

Gemini CLI is an MCP **client** — it connects to NxtSend's existing MCP
server and can call its tools. This guide does **not** build a new MCP
server and adds no new tools. NxtSend already exposes its MCP server at:

| Flavour | URL |
|---|---|
| Generic / ChatGPT (use this one for Gemini) | `https://<your-nxtsend-origin>/api/mcp/chatgpt` |
| Muse | `https://<your-nxtsend-origin>/api/mcp` |
| Claude | `https://<your-nxtsend-origin>/api/mcp/claude` |

Replace `<your-nxtsend-origin>` with your deployment origin, e.g.
`https://nxtsend.com`. Use the `/api/mcp/chatgpt` flavour for Gemini: it is
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
2. **Dynamic client registration (DCR).** The client registers at
   `https://<origin>/api/muse/oauth/register`. No pre-registered client
   id is needed.
3. **Authorization.** Browser sign-in at
   `https://<origin>/api/muse/oauth/authorize` (user signs in to NxtSend
   and approves the scopes).
4. **Token exchange.** `https://<origin>/api/muse/oauth/token` (PKCE
   `code_verifier` required). Refresh tokens rotate on use.
5. **Revocation.** `https://<origin>/api/muse/oauth/revoke`.

**Redirect URIs.** Loopback redirects (`http://localhost:<port>` and
`http://127.0.0.1:<port>`) are allowed for **every** platform, including
`chatgpt` — Gemini CLI's local callback works without any allowlist change.

**Scopes.** Reuse the existing `nxtsend.*` scopes — no new scope alias is
needed for Gemini:

| Scope | Grants |
|---|---|
| `nxtsend.read` | Read leads, campaigns, inbox, stats |
| `nxtsend.write` | Create/update leads and campaigns |
| `nxtsend.send` | Send-capable tools (separate tier — request it only if you need the send tools) |

## Step-by-step connection

```bash
# 1. Add the server (Streamable HTTP transport).
gemini mcp add --transport http nxtsend https://<your-nxtsend-origin>/api/mcp/chatgpt

# 2. Authenticate — Gemini CLI discovers the OAuth endpoints from the
#    server's 401 response and opens the browser sign-in.
gemini mcp auth nxtsend

# 3. List tools to confirm the connection.
gemini mcp list
```

Or edit the settings file directly (`~/.gemini/settings.json`, or
`.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "nxtsend": {
      "httpUrl": "https://<your-nxtsend-origin>/api/mcp/chatgpt"
    }
  }
}
```

Then run `gemini mcp auth nxtsend` and approve the sign-in in the browser.

## What Gemini can do once connected

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

## Gemini-specific caveats

- As of 18 June 2026, **Gemini CLI stopped serving free, AI Pro and AI
  Ultra individual accounts** (those users were moved to the Antigravity
  CLI). Connecting Gemini CLI to NxtSend requires a **paid Gemini API
  key** or **Google AI Code Assist Standard/Enterprise**. If your account
  is on the free/Pro/Ultra individual tier, Gemini CLI will not start —
  use Cursor or Claude Code instead.
- Gemini CLI's OAuth discovery relies on the server's `401` +
  `WWW-Authenticate` response naming
  `/.well-known/oauth-protected-resource`; that behaviour is implemented
  in `src/lib/muse-connector/mcp.ts`.

## Troubleshooting

- `401` with no redirect to sign-in: check the server is reachable at
  `https://<origin>/api/mcp/chatgpt` and that the
  `/.well-known/oauth-protected-resource/api/mcp/chatgpt` document loads.
- "Invalid redirect URI": Gemini CLI uses a loopback callback, which is
  allowlisted for every platform — if it still fails, the server may be
  running an older deploy; confirm the deployed commit includes the
  loopback allowlist in `src/lib/muse-connector/oauth/clients.ts`.
- "Insufficient scope" on a tool call: re-authenticate with the scope
  that tool needs (`.read` for reads, `.write` for creates/updates,
  `.send` for send-capable tools).
