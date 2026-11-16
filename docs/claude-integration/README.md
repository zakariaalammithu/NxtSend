# NxtSend × Claude.ai — Integration Documentation

NxtSend exposes itself to Claude (claude.ai / claude.com) as a custom
connector: an OAuth 2.1 server plus a hosted MCP server that Claude calls
into on behalf of a signed-in NxtSend user. The direction is inverted
from the usual "app calls Anthropic" pattern — **NxtSend is the server;
Claude is the client.**

This surface is built on top of the Muse (Meta) and ChatGPT connectors
that already exist in this codebase. All three share one OAuth server,
one tool manifest and one MCP handler; they differ only in MCP path,
scope prefix, resource URL, redirect URI and (for Claude) prompts.

## Status (read this first)

- **Implemented and unit-tested in this codebase.** The OAuth server
  extensions, the Claude MCP route (`/api/mcp/claude`, 54 tools),
  the 4 Claude-only prompts, the `nxtsend://account` resource, the
  `claude.*` scopes, the Claude Integration Center entry, the admin
  grants-by-origin split and the `claude-mcp` health check all exist
  and are covered by tests (see TESTING.md).
- **Not submitted to Anthropic, not approved.** Nothing here has been
  submitted to Anthropic for review, and no approval is claimed. Until
  that happens the only way to use it is Claude's **custom connector**
  path: Customize → Connectors → Add custom connector (see
  CLAUDE_SETUP.md). A directory listing is a separate submission +
  review step — it is not claimed either.
- **No live Claude connect has been attempted from this environment.**
  The full OAuth grant flow inside Claude, the prompts surfacing and
  the `nxtsend://account` resource read inside a live Claude client
  are **PENDING** — they need the deployed site plus a real Claude
  account on a plan that offers custom connectors (see the final
  report, `NxtSend_Claude_Integration_Final_Report.md`).
- **LinkedIn sends are NOT SUPPORTED.** No tool sends a LinkedIn
  connection request or message, because no authorized LinkedIn
  provider exists and the official LinkedIn API exposes no
  connection-request/DM endpoints to standard developers.
- **No Anthropic API key is needed for the connection itself.**
  `ANTHROPIC_API_KEY` is used only for message drafting
  (`draft_outreach_message`); the MCP connection is OAuth between
  Claude and NxtSend.
- **One honest caveat on the redirect URIs:** both
  `https://claude.ai/api/mcp/auth_callback` and
  `https://claude.com/api/mcp/auth_callback` are allowlisted, but only
  the `claude.ai` variant was confirmed in the official Anthropic
  documentation fetched during implementation (see OAUTH_SETUP.md).
  If Claude never sends the `claude.com` variant, remove it.

## What Claude can do with NxtSend

Once connected, Claude can, within the granting user's workspace and
only within the granted scopes:

- **Read** leads, campaigns, sequences, inbox conversations, LinkedIn
  account health, subscription/limits, usage and performance (36 Read
  tools).
- **Write** leads, campaigns (draft only), sequence steps, enrollments
  (14 Write tools).
- **Send email / delete** only with per-action approval in Claude
  (4 Sensitive write tools: `send_email`, `send_inbox_reply`,
  `delete_lead`, `delete_campaign`).
- **Use 4 prompts** (Claude-only): campaign performance summary,
  lead follow-up draft, weekly performance report, duplicate-lead
  cleanup. Prompts are templates — they fetch no data and never
  send, merge or delete anything.
- **Read the account resource** `nxtsend://account` (connected user,
  workspace, client, grant, scopes, audience — no secrets, no plan).
- **Render** a campaigns dashboard widget from data it already
  fetched with `list_campaigns` (`ui://widget/campaigns.html`).

Everything is workspace-scoped and scope-enforced. Demo Mode refuses
the whole surface — no demo data is ever served to Claude.

## Documents

| File | Contents |
|---|---|
| ARCHITECTURE.md | System overview, request flows, module map |
| MCP_SERVER.md | The `/api/mcp/claude` endpoint: protocol, auth, prompts, resources, errors, rate limiting |
| OAUTH_SETUP.md | OAuth 2.1 server: endpoints, PKCE, DCR, CIMD, scopes, RFC 8707/9207, `private_key_jwt`, `offline_access` |
| MCP_TOOLS.md | All 54 tools with classifications and annotations |
| PERMISSIONS.md | Scope tiers, what each scope allows, approval rules, the missing-scope message caveat |
| SECURITY.md | Threat model, token storage, rotation, revocation, audit, rate limiting |
| DATABASE.md | Migrations 023 + 024 (reused — no new tables), RLS, what is (and is not) stored |
| VERCEL_DEPLOYMENT.md | Deploy checklist, env vars, Hobby-plan notes |
| CLAUDE_SETUP.md | Connecting from Claude (custom connector), plan availability |
| TESTING.md | Test inventory, how to run, what is verified vs pending |
| TROUBLESHOOTING.md | Common failures and their fixes |

## Quick start (owner)

1. Apply migrations `023_muse_oauth.sql` and `024_chatgpt_oauth_resource.sql`
   in Supabase (see DATABASE.md). No new migration is needed for Claude.
2. Set `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) and
   `NEXT_PUBLIC_APP_URL=https://nxtsend.com` in Vercel; redeploy.
   `CLAUDE_MCP_ENABLED` / `CLAUDE_MCP_PUBLIC_URL` are optional overrides
   (see VERCEL_DEPLOYMENT.md).
3. In Claude: Customize → Connectors → Add custom connector, name it
   NxtSend, and paste `https://nxtsend.com/api/mcp/claude`
   (see CLAUDE_SETUP.md).
4. Approve on NxtSend's consent screen with `claude.read` only, unless
   Claude genuinely needs more.

## Related work

- The Muse (Meta) connector shares the same OAuth server and the same
  tables, on `/api/mcp` with `muse.*` scopes — see
  `docs/muse-integration/`. The ChatGPT connector shares them too, on
  `/api/mcp/chatgpt` with `nxtsend.*` scopes — see
  `docs/chatgpt-integration/`. The three surfaces differ only in
  platform, MCP path, scope prefix, resource URL, redirect URI and
  (Claude only) prompts.
- The in-app settings surface is the Integration Center entry `claude`
  (Dashboard → Integrations → Claude.ai (Anthropic)), implemented in
  `src/lib/integrations-center/` and
  `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx`.
- Admin overview: Admin → Integrations → Muse.ai (grants by client
  origin now Muse / ChatGPT / Claude / Other / Total) and
  `GET /api/admin/muse`, behind `resolveAdminGate()`.
