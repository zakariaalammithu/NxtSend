# Troubleshooting

## "Claude cannot add the connector" / redirect mismatch

- Check the deployment's public URL is the one in
  `CLAUDE_MCP_PUBLIC_URL` / `MUSE_MCP_PUBLIC_URL` /
  `NEXT_PUBLIC_APP_URL` — the metadata documents advertise it, and
  the RFC 8707 resource URLs follow it. A mismatch between the URL
  Claude was given and the deployment's advertised origin is the
  usual cause.
- The redirect URIs Claude may register are exactly
  `https://claude.ai/api/mcp/auth_callback` and
  `https://claude.com/api/mcp/auth_callback` (plus loopback for local
  testing). Anything else is refused. Note the `claude.com` variant
  was allowlisted without confirmation in the official doc (see
  OAUTH_SETUP.md) — if Claude never sends it, remove it; if Claude
  sends a *different* callback, the allowlist in
  `src/lib/muse-connector/oauth/clients.ts` is the place to look, and
  any addition there needs a matching platform binding.
- A Muse client presenting a Claude callback (or vice versa) is
  refused even when the URI is registered — that is the platform
  binding, not a bug. The client must register the callback for its
  own platform.

## Authorize returns 503

`TOKEN_ENCRYPTION_KEY` is missing or malformed — the authorize-state
token cannot be signed. Generate one (`openssl rand -base64 32`),
set it in Vercel, redeploy. No other key is needed for Claude.

## Status "Not Connected" / "Configuration Required"

- `CLAUDE_MCP_ENABLED` (or its `MUSE_MCP_ENABLED` fallback) is
  false, or no public URL is set (`CLAUDE_MCP_PUBLIC_URL`,
  `MUSE_MCP_PUBLIC_URL` or `NEXT_PUBLIC_APP_URL`). Set one and
  redeploy.
- "Connected but Not Verified" with no grant is **correct** —
  configuration is not a connection. A grant appears only after a
  completed OAuth flow from Claude.

## MCP calls return 401

- The access token is unknown, expired, revoked, or bound to another
  platform's resource (RFC 8707): a token issued for `/api/mcp` or
  `/api/mcp/chatgpt` does not validate for `/api/mcp/claude`.
  Reconnect from Claude to get a Claude-bound token.
- The app is in Demo Mode — demo refuses all Claude tokens by design.
- The 401 body names the flavor ("a valid Claude access token is
  required" on the Claude route) and the `WWW-Authenticate` header
  names the Claude metadata document.

## MCP returns 503 `not_configured` in Demo Mode

Expected — the MCP server serves no demo data, ever. Connect Supabase
and configure OAuth to enable it.

## MCP returns 503 `not_configured` (disabled)

`CLAUDE_MCP_ENABLED` — or its `MUSE_MCP_ENABLED` fallback — is
false. Unset both to enable. The OAuth routes stay available when
disabled, so this never leaves a half-issued grant against a dead
server; re-enable and reconnect.

## A tool call answers `missing_scope` naming `muse.write`

Read PERMISSIONS.md: the message names the canonical `muse.*` scope
for the tier, but the tier check is prefix-agnostic — grant
**`claude.write`** (same tier, Claude prefix) on the consent screen
and reconnect. Do not try to grant a `muse.*` scope to a Claude
client; the consent screen for a Claude client offers `claude.*`
scopes.

## A grant shows as inactive

Its refresh token expired (60 days) or was revoked — reconnect from
Claude to create a fresh grant. A reused (already-rotated) refresh
token revokes the whole grant automatically.

## `get_date_range_report` answers BLOCKED / 501

By design: the stats loaders compute over all-time records and
cannot filter by date. Use `get_performance_summary` (workspace-wide,
all-time) or `get_campaign_performance` (one campaign).

## Prompts don't appear / `prompts/list` answers "Method not found"

Prompts are Claude-only. On the Muse and ChatGPT flavors both prompt
methods answer `-32601` by design. If they answer `-32601` on the
Claude flavor, the request is not reaching `/api/mcp/claude` — check
the MCP URL Claude was given (it must end in `/api/mcp/claude`).

## The `nxtsend://account` resource has no plan

Deliberate: the grant carries no plan, and inventing one would be
fake data. Use the `get_profile` tool for the workspace plan.

## No Claude grants in the admin overview

Zero grants is normal, not a failure — no Claude user has connected
yet. A **null** grant count means the migration 023 tables could not
be read: apply migrations 023 + 024 (see DATABASE.md). The
`claude-mcp` System Health check reports the same condition.

## Build: ENOENT renaming `.next/export/500.html`

A transient failure on a stale `.next` directory, seen once during
this work. Fix: `rm -rf .next` and rebuild. Not a code issue.
