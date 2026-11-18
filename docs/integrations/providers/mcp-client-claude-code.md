# Claude Code — connect to NxtSend as an MCP client

> Status: **config-ready guide, not live-tested.** No Claude Code client
> has been run against the NxtSend MCP server from this environment. The
> endpoint, OAuth URLs and scopes below are verified from the server code
> (`src/lib/muse-connector/mcp.ts`, `src/lib/muse-connector/oauth/config.ts`,
> `src/lib/muse-connector/oauth/clients.ts`); the connection steps are
> verified from Anthropic's Claude Code MCP documentation.

## What this is

Claude Code is an MCP **client** — it connects to NxtSend's existing MCP
server and can call its tools. This guide does **not** build a new MCP
server and adds no new tools. NxtSend already exposes its MCP server at:

| Flavour | URL |
|---|---|
| Claude (use this one for Claude Code) | `https://<your-nxtsend-origin>/api/mcp/claude` |
| Generic / ChatGPT | `https://<your-nxtsend-origin>/api/mcp/chatgpt` |
| Muse | `https://<your-nxtsend-origin>/api/mcp` |

Replace `<your-nxtsend-origin>` with your deployment origin, e.g.
`https://nxtsend.com`. Use the `/api/mcp/claude` flavour for Claude Code:
it is the Claude-specific endpoint and its OAuth platform is `claude`,
which is the platform the shared OAuth 2.1 server maps the `nxtsend.*`
scopes to. (The generic `/api/mcp/chatgpt` flavour also works — the
tool set is the same 54 tools.)

Note: the Claude flavour also exposes 4 text-only MCP prompts and a
read-only `nxtsend://account` resource on the server side; those are
server features, not something this guide configures.

## OAuth flow (shared server)

The NxtSend MCP server uses the shared OAuth 2.1 server (PKCE S256,
dynamic client registration, refresh-token rotation).

1. **Discovery.** On the first request the server answers `401` with a
   `WWW-Authenticate` header naming the protected-resource metadata:
   `https://<origin>/.well-known/oauth-protected-resource/api/mcp/claude`
   (the root document is at
   `https://<origin>/.well-known/oauth-protected-resource`).
   The authorization-server metadata is at
   `https://<origin>/.well-known/oauth-authorization-server`.
2. **Dynamic client registration (DCR).** Claude Code registers at
   `https://<origin>/api/muse/oauth/register`. No pre-registered client
   id is needed.
3. **Authorization.** Browser sign-in at
   `https://<origin>/api/muse/oauth/authorize` (user signs in to NxtSend
   and approves the scopes).
4. **Token exchange.** `https://<origin>/api/muse/oauth/token` (PKCE
   `code_verifier` required). Refresh tokens rotate on use.
5. **Revocation.** `https://<origin>/api/muse/oauth/revoke`.

**Redirect URIs.** Claude Code uses an ephemeral loopback callback
(`http://localhost:<ephemeral-port>`). Loopback redirects are allowed for
**every** platform, and the Claude allowlist in
`src/lib/muse-connector/oauth/clients.ts` explicitly mentions
"Claude Code's ephemeral loopback port" — no allowlist change is needed.

**Scopes.** Reuse the existing `nxtsend.*` scopes — no new scope alias is
needed for Claude Code:

| Scope | Grants |
|---|---|
| `nxtsend.read` | Read leads, campaigns, inbox, stats |
| `nxtsend.write` | Create/update leads and campaigns |
| `nxtsend.send` | Send-capable tools (separate tier — request it only if you need the send tools) |

## Step-by-step connection

```bash
# 1. Add the server (Streamable HTTP transport).
claude mcp add --transport http nxtsend https://<your-nxtsend-origin>/api/mcp/claude

# 2. Authenticate — Claude Code discovers the OAuth endpoints from the
#    server's 401 response and opens the browser sign-in.
claude mcp login nxtsend

# 3. Verify inside a session with /mcp — the server should show as
#    connected with its tools listed.
claude
# then type: /mcp
```

Configuration is stored in `~/.claude.json` (user scope) or `.mcp.json`
(project scope); `claude mcp add` writes it for you. To re-authenticate
later, run `claude mcp login nxtsend` again, or use `/mcp` inside a
session and choose the server.

## What Claude Code can do once connected

- **54 tools** (verified count in `src/lib/muse-connector/manifest.ts`):
  lead search and management, campaign create/list, inbox replies and
  drafts, campaign stats (all-time only), and more.
- `initialize`, `tools/list` and `resources/list` work without a token;
  tool calls and `resources/read` require a valid OAuth token.
- The Claude flavour's 4 text-only prompts and the read-only
  `nxtsend://account` resource are available to the client if it
  requests them.

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
  `https://<origin>/api/mcp/claude` and that the
  `/.well-known/oauth-protected-resource/api/mcp/claude` document loads.
- "Invalid redirect URI": Claude Code uses an ephemeral loopback port,
  which is explicitly allowlisted for the `claude` platform — if it
  still fails, the server may be running an older deploy; confirm the
  deployed commit includes the loopback allowlist in
  `src/lib/muse-connector/oauth/clients.ts`.
- "Insufficient scope" on a tool call: re-authenticate with the scope
  that tool needs (`.read` for reads, `.write` for creates/updates,
  `.send` for send-capable tools).
- Stale tokens: `claude mcp login nxtsend` re-runs the OAuth flow and
  replaces the stored tokens.
