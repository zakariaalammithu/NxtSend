# NxtSend × ChatGPT — Integration Documentation

NxtSend exposes itself to ChatGPT (chatgpt.com) as a connector: an OAuth 2.1
server plus a hosted MCP server that ChatGPT calls into on behalf of a
signed-in NxtSend user. The direction is inverted from the usual
"app calls OpenAI" pattern — **NxtSend is the server; ChatGPT is the client.**

## Status (read this first)

- **Implemented and unit-tested in this codebase.** The OAuth server, the
  ChatGPT MCP route (`/api/mcp/chatgpt`, 54 tools), the scopes, the CIMD
  client handling, the RFC 8707 resource binding and the campaigns widget
  all exist and are covered by tests (see TESTING.md).
- **Not submitted to OpenAI, not approved.** Nothing here has been submitted
  to OpenAI for review, and no approval is claimed. Until that happens the
  only way to use it is ChatGPT **Developer Mode** (see CHATGPT_SETUP.md).
- **No live ChatGPT connect has been attempted from this environment.**
  The full OAuth grant flow inside ChatGPT and the widget render inside a
  live ChatGPT client are **PENDING** — they need the deployed site plus a
  real ChatGPT account (see the final report,
  `NxtSend_ChatGPT_Integration_Final_Report.md`).
- **LinkedIn sends are NOT SUPPORTED.** No tool sends a LinkedIn connection
  request or message, because no authorized LinkedIn provider exists and the
  official LinkedIn API exposes no connection-request/DM endpoints to
  standard developers.
- **No OpenAI API key is needed for the connection itself.** `OPENAI_API_KEY`
  is used only for message drafting (`draft_outreach_message`); the MCP
  connection is OAuth between ChatGPT and NxtSend.

## What ChatGPT can do with NxtSend

Once connected, ChatGPT can, within the granting user's workspace and only
within the granted scopes:

- **Read** leads, campaigns, sequences, inbox conversations, LinkedIn
  account health, subscription/limits, usage and performance (36 Read tools).
- **Write** leads, campaigns (draft only), sequence steps, enrollments
  (14 Write tools).
- **Send email / delete** only with per-action approval in ChatGPT
  (4 Sensitive write tools: `send_email`, `send_inbox_reply`,
  `delete_lead`, `delete_campaign`).
- **Render** a campaigns dashboard widget (Apps SDK UI) from data it
  already fetched with `list_campaigns`.

Everything is workspace-scoped and scope-enforced. Demo Mode refuses the
whole surface — no demo data is ever served to ChatGPT.

## Documents

| File | Contents |
|---|---|
| ARCHITECTURE.md | System overview, request flows, module map |
| MCP_SERVER.md | The `/api/mcp/chatgpt` endpoint: protocol, discovery, auth, errors, rate limiting |
| OAUTH_SETUP.md | OAuth 2.1 server: endpoints, PKCE, DCR, CIMD, scopes, RFC 8707/9207, `private_key_jwt` |
| MCP_TOOLS.md | All 54 tools with classifications and annotations |
| PERMISSIONS.md | Scope tiers, what each scope allows, approval rules |
| SECURITY.md | Threat model, token storage, rotation, revocation, audit, rate limiting |
| DATABASE.md | Migrations 023 + 024, tables, RLS, what is (and is not) stored |
| VERCEL_DEPLOYMENT.md | Deploy checklist, env vars, Hobby-plan notes |
| CHATGPT_SETUP.md | Connecting from ChatGPT (Developer Mode), plan availability |
| APP_SUBMISSION.md | What OpenAI submission would involve; what is NOT claimed |
| TESTING.md | Test inventory, how to run, what is verified vs pending |
| TROUBLESHOOTING.md | Common failures and their fixes |

## Quick start (owner)

1. Apply migrations `023_muse_oauth.sql` and `024_chatgpt_oauth_resource.sql`
   in Supabase (see DATABASE.md).
2. Set `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) and
   `NEXT_PUBLIC_APP_URL=https://nxtsend.com` in Vercel; redeploy.
   `CHATGPT_MCP_ENABLED` / `CHATGPT_MCP_PUBLIC_URL` are optional overrides
   (see VERCEL_DEPLOYMENT.md).
3. In ChatGPT: Settings → Connectors → Advanced → Developer mode on, add
   `https://nxtsend.com/api/mcp/chatgpt` (see CHATGPT_SETUP.md).
4. Approve on NxtSend's consent screen with `nxtsend.read` only, unless
   ChatGPT genuinely needs more.

## Related work

- The Muse (Meta) connector shares the same OAuth server and the same
  tables, on `/api/mcp` with `muse.*` scopes — see
  `docs/muse-integration/`. The two surfaces differ only in platform,
  MCP path, scope prefix and resource URL.
- The in-app settings surface is the Integration Center entry `chatgpt`
  (Dashboard → Integrations → ChatGPT), implemented in
  `src/lib/integrations-center/` and
  `src/app/(dashboard)/dashboard/integrations/[id]/page.tsx`.
- Admin overview: Admin → Integrations → Muse.ai (grants by client origin
  included) and `GET /api/admin/muse`, behind `resolveAdminGate()`.
